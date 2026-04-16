/**
 * scripts/scrape-heroes.ts
 *
 * Fetches all hero data from Module:Hero/data on the MLBB wiki,
 * uploads portraits to OCI CDN, and upserts into PostgreSQL.
 *
 * Usage: npm run scrape:heroes
 */

import "dotenv/config";
import { HeroRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { getPageWikitext, getImageUrl, slugify, withRetry } from "./lib/mediawiki";
import { parseHeroModule } from "./lib/lua-parser";
import { mirrorImageToCDN } from "../lib/oci-storage";

const PATCH_VERSION = process.env.SCRAPE_PATCH ?? "1.8.88";

const ROLE_MAP: Record<string, HeroRole> = {
  assassin:  HeroRole.ASSASSIN,
  fighter:   HeroRole.FIGHTER,
  mage:      HeroRole.MAGE,
  marksman:  HeroRole.MARKSMAN,
  support:   HeroRole.SUPPORT,
  tank:      HeroRole.TANK,
};

function resolveRoles(r1: string | null, r2: string | null): HeroRole[] {
  return [r1, r2]
    .filter(Boolean)
    .map((r) => ROLE_MAP[r!.toLowerCase()])
    .filter((r): r is HeroRole => r !== undefined);
}

async function main() {
  console.log("??  Fetching Module:Hero/data...");
  const lua = await withRetry(() => getPageWikitext("Module:Hero/data"));
  const heroes = parseHeroModule(lua);
  console.log("   Parsed " + heroes.length + " heroes from the data module.\n");

  const patch = await prisma.patchVersion.upsert({
    where: { version: PATCH_VERSION },
    update: {},
    create: { version: PATCH_VERSION, isLatest: true },
  });

  let processed = 0;
  let failed = 0;

  for (const raw of heroes) {
    try {
      process.stdout.write("[" + (processed + 1) + "/" + heroes.length + "] " + raw.name);
      const slug = slugify(raw.name);
      const imageFile = slug + ".png";

      try {
        const remoteUrl = await withRetry(() => getImageUrl(raw.name + ".png"));
        await withRetry(() => mirrorImageToCDN(remoteUrl, "heroes/" + imageFile));
        process.stdout.write(" ??");
      } catch {
        // Non-fatal
      }

      const roles = resolveRoles(raw.role1, raw.role2);

      // Combine specialty1 + specialty2 into a slash-delimited string
      const specialty = [raw.specialty1, raw.specialty2].filter(Boolean).join("/") || null;
      // Combine lane1 + lane2 into a slash-delimited string
      const lane = [raw.lane1, raw.lane2].filter(Boolean).join("/") || null;
      const resource = raw.resource || null;
      const dmgType  = raw.dmgType  || null;
      const atkType  = raw.atkType  || null;

      const hero = await prisma.hero.upsert({
        where: { slug },
        update: { name: raw.name, title: raw.title, role: roles, specialty, lane, resource, dmgType, atkType, imageFile, updatedAt: new Date() },
        create: { slug, name: raw.name, title: raw.title, role: roles, specialty, lane, resource, dmgType, atkType, imageFile },
      });

      // Compute per-level growth from level 1 and level 15 values
      const growth = (v15: number | null, v1: number | null) =>
        v15 !== null && v1 !== null ? Math.round(((v15 - v1) / 14) * 100) / 100 : 0;

      const statsPayload = {
        baseHp:       raw.hp1 ?? 0,
        hpGrowth:     growth(raw.hp15, raw.hp1),
        baseMana:     raw.mana1 ?? 0,
        manaGrowth:   growth(raw.mana15, raw.mana1),
        baseAtkPhys:  raw.physAtk1 ?? 0,
        atkPhysGrowth: growth(raw.physAtk15, raw.physAtk1),
        baseAtkMag:   0,
        atkMagGrowth: 0,
        baseArmor:    raw.physDef1 ?? 0,
        armorGrowth:  growth(raw.physDef15, raw.physDef1),
        baseMagRes:   raw.magDef1 ?? 0,
        magResGrowth: growth(raw.magDef15, raw.magDef1),
        baseMoveSpeed: raw.movementSpd ?? 0,
        baseAttackSpd: raw.atkSpd1 ?? 0,
        atkSpdGrowth:  growth(raw.atkSpd15, raw.atkSpd1),
        baseHpRegen:  raw.hpRegen1 ?? 0,
        baseManaRegen: raw.manaRegen1 ?? 0,
      };

      await prisma.heroStats.upsert({
        where: { heroId_patchId: { heroId: hero.id, patchId: patch.id } },
        update: statsPayload,
        create: { heroId: hero.id, patchId: patch.id, ...statsPayload },
      });

      console.log(" ?");
      processed++;
      await new Promise((r) => setTimeout(r, 150));
    } catch (err: any) {
      console.log(" ? " + err.message);
      failed++;
    }
  }

  console.log("\n?  Done. Processed: " + processed + " | Failed: " + failed);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
