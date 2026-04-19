/**
 * scripts/fix-skill-images.ts
 *
 * Retroactively uploads missing skill icons to the CDN for heroes that are
 * already in the database. Re-fetches each hero's wiki page and tries multiple
 * candidate image filenames in order.
 *
 * Usage:
 *   npx tsx scripts/fix-skill-images.ts              # all heroes with skills
 *   npx tsx scripts/fix-skill-images.ts -- Aldous    # specific heroes
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { getPageWikitext, getImageUrl, withRetry } from "./lib/mediawiki";
import { mirrorImageToCDN } from "../lib/oci-storage";
import type { SkillSlot } from "@prisma/client";

// ---------------------------------------------------------------------------
// Helpers (duplicated from scrape-skills.ts to keep script self-contained)
// ---------------------------------------------------------------------------

function getParam(block: string, key: string): string | null {
  const esc = key.replace(/[.+*?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `\\|\\s*${esc}\\s*=\\s*([\\s\\S]*?)(?=\\|\\s*[\\w.-]+\\s*=|\\}\\})`,
    "i"
  );
  const m = block.match(re);
  if (!m) return null;
  return m[1].replace(/<[^>]+>/g, "").replace(/\{\{[^}]+\}\}/g, "").replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, "$2").replace(/\s+/g, " ").trim();
}

function extractSection(wikitext: string, title: string): string | null {
  const esc = title.replace(/[.+*?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`===\\s*${esc}\\s*===([\\s\\S]*?)(?====|==|$)`, "i");
  const m = wikitext.match(re);
  return m ? m[1] : null;
}

function extractAbilityBlock(section: string): string | null {
  const startIdx = section.search(/\{\{[Aa]bility/);
  if (startIdx === -1) return null;
  let depth = 0;
  let i = startIdx;
  while (i < section.length) {
    if (section[i] === "{" && section[i + 1] === "{") { depth++; i += 2; continue; }
    if (section[i] === "}" && section[i + 1] === "}") { depth--; i += 2; if (depth === 0) return section.slice(startIdx, i); continue; }
    i++;
  }
  return section.slice(startIdx);
}

async function tryGetImageUrl(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    try {
      return await withRetry(() => getImageUrl(candidate));
    } catch {
      // try next
    }
  }
  return null;
}

const SLOT_MAP: { slot: SkillSlot; label: string; titles: string[] }[] = [
  { slot: "PASSIVE", label: "passive", titles: ["Passive"] },
  { slot: "S1",      label: "s1",      titles: ["Skill 1", "Skill1", "Active"] },
  { slot: "S2",      label: "s2",      titles: ["Skill 2", "Skill2"] },
  { slot: "S3",      label: "s3",      titles: ["Skill 3", "Skill3"] },
  { slot: "S4",      label: "ult",     titles: ["Ultimate"] },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const filterArgs = process.argv.slice(3); // names after "--"

  const heroes = await prisma.hero.findMany({
    select: { id: true, slug: true, name: true },
    orderBy: { name: "asc" },
  });

  const targets = filterArgs.length > 0
    ? heroes.filter((h) => filterArgs.some((a) => a.toLowerCase() === h.name.toLowerCase() || a.toLowerCase() === h.slug))
    : heroes;

  console.log(`Fixing skill images for ${targets.length} hero(es)...\n`);

  let fixed = 0;
  let notFound = 0;

  for (const hero of targets) {
    process.stdout.write(`${hero.name}`);

    try {
      const wikitext = await withRetry(() => getPageWikitext(hero.name));
      const abilitiesIdx = wikitext.search(/==\s*Abilit/i);
      if (abilitiesIdx === -1) {
        console.log(" [no abilities section]");
        continue;
      }
      const afterAbilities = wikitext.slice(abilitiesIdx);
      const endMatch = afterAbilities.slice(2).search(/^==[^=]/m);
      const abilitiesBlock = endMatch > 0
        ? afterAbilities.slice(0, endMatch + 2)
        : afterAbilities;

      let heroFixed = 0;

      for (const { slot, label, titles } of SLOT_MAP) {
        let section: string | null = null;
        for (const title of titles) {
          section = extractSection(abilitiesBlock, title);
          if (section) break;
        }
        if (!section) continue;

        const block = extractAbilityBlock(section);
        if (!block) continue;

        const name = getParam(block, "name") ?? `${hero.name} ${slot}`;
        const imageParam = getParam(block, "image-legend") ?? getParam(block, "image");
        const imageFile = `${hero.slug}-${slot.toLowerCase()}.png`;

        const candidates = [
          imageParam ? `${imageParam}.png` : null,
          `${name}.png`,
          `${hero.name} ${name}.png`,
          `${hero.name}${name}.png`,
          `${hero.name} ${label}.png`,
        ].filter((c): c is string => !!c);

        const imgUrl = await tryGetImageUrl(candidates);
        if (imgUrl) {
          try {
            await withRetry(() => mirrorImageToCDN(imgUrl, `skills/${imageFile}`));
            process.stdout.write(` [${slot}✓]`);
            heroFixed++;
            fixed++;
          } catch (uploadErr) {
            process.stdout.write(` [${slot} upload-err]`);
          }
        } else {
          process.stdout.write(` [${slot}?]`);
          notFound++;
        }

        await new Promise((r) => setTimeout(r, 300));
      }

      console.log(heroFixed > 0 ? ` → ${heroFixed} fixed` : " → nothing new");
      await new Promise((r) => setTimeout(r, 400));
    } catch (err) {
      console.log(` [FAILED: ${(err as Error).message.slice(0, 80)}]`);
    }
  }

  console.log(`\nDone. Uploaded: ${fixed} | Not found on wiki: ${notFound}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
