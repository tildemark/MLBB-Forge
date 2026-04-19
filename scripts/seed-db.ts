/**
 * scripts/seed-db.ts
 *
 * Loads pre-scraped JSON snapshots from data/seeds/ and upserts them into
 * the database. Does NOT hit the wiki or upload anything to CDN.
 *
 * Run this after a fresh `prisma db push` to populate the DB without
 * re-scraping from the wiki.
 *
 * Usage: npm run db:seed
 */

import "dotenv/config";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { HeroRole, ItemCategory } from "@prisma/client";
import { prisma } from "../lib/prisma";

const SEEDS_DIR = join(process.cwd(), "data/seeds");

function readSeed<T>(filename: string): T | null {
  const path = join(SEEDS_DIR, filename);
  if (!existsSync(path)) {
    console.warn(`  ⚠  Seed file not found: data/seeds/${filename} — skipping`);
    return null;
  }
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

// ---------------------------------------------------------------------------
// Heroes
// ---------------------------------------------------------------------------
async function seedHeroes() {
  const data = readSeed<{
    patch: string;
    heroes: Array<{
      slug: string; name: string; title: string | null; role: HeroRole[];
      specialty: string | null; lane: string | null; resource: string | null;
      dmgType: string | null; atkType: string | null; imageFile: string;
      stats: {
        baseHp: number; hpGrowth: number; baseMana: number; manaGrowth: number;
        baseAtkPhys: number; atkPhysGrowth: number; baseAtkMag: number; atkMagGrowth: number;
        baseArmor: number; armorGrowth: number; baseMagRes: number; magResGrowth: number;
        baseMoveSpeed: number; baseAttackSpd: number; atkSpdGrowth: number;
        baseHpRegen: number; baseManaRegen: number;
      };
    }>;
  }>("heroes.json");
  if (!data) return;

  const patch = await prisma.patchVersion.upsert({
    where: { version: data.patch },
    update: {},
    create: { version: data.patch, isLatest: true },
  });

  let count = 0;
  for (const h of data.heroes) {
    const hero = await prisma.hero.upsert({
      where: { slug: h.slug },
      update: { name: h.name, title: h.title, role: h.role, specialty: h.specialty, lane: h.lane, resource: h.resource, dmgType: h.dmgType, atkType: h.atkType, imageFile: h.imageFile, updatedAt: new Date() },
      create: { slug: h.slug, name: h.name, title: h.title, role: h.role, specialty: h.specialty, lane: h.lane, resource: h.resource, dmgType: h.dmgType, atkType: h.atkType, imageFile: h.imageFile },
    });
    await prisma.heroStats.upsert({
      where: { heroId_patchId: { heroId: hero.id, patchId: patch.id } },
      update: h.stats,
      create: { heroId: hero.id, patchId: patch.id, ...h.stats },
    });
    count++;
  }
  console.log(`  ✓ Heroes: ${count} upserted`);
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------
async function seedItems() {
  const data = readSeed<{
    patch: string;
    items: Array<{
      slug: string; name: string; category: ItemCategory; tier: number; imageFile: string;
      stats: {
        goldCost: number; passiveName: string | null; passiveDesc: string | null;
        hp: number; mana: number; physAtk: number; magPower: number; physDef: number;
        magDef: number; physPenFlat: number; physPenPct: number; magPenFlat: number;
        magPenPct: number; critRate: number; critDamage: number; attackSpeed: number;
        lifeSteal: number; spellVamp: number; cdr: number; moveSpeed: number;
        hpRegen: number; manaRegen: number;
      };
    }>;
  }>("items.json");
  if (!data) return;

  const patch = await prisma.patchVersion.upsert({
    where: { version: data.patch },
    update: {},
    create: { version: data.patch, isLatest: true },
  });

  let count = 0;
  for (const i of data.items) {
    const item = await prisma.item.upsert({
      where: { slug: i.slug },
      update: { name: i.name, category: i.category, tier: i.tier, imageFile: i.imageFile, updatedAt: new Date() },
      create: { slug: i.slug, name: i.name, category: i.category, tier: i.tier, imageFile: i.imageFile },
    });
    const { goldCost, passiveName, passiveDesc, ...bonuses } = i.stats;
    await prisma.itemStats.upsert({
      where: { itemId_patchId: { itemId: item.id, patchId: patch.id } },
      update: { ...bonuses, goldCost, passiveName, passiveDesc },
      create: { itemId: item.id, patchId: patch.id, ...bonuses, goldCost, passiveName, passiveDesc },
    });
    count++;
  }
  console.log(`  ✓ Items: ${count} upserted`);
}

// ---------------------------------------------------------------------------
// Spells
// ---------------------------------------------------------------------------
async function seedSpells() {
  const spells = readSeed<Array<{ slug: string; name: string; description: string; imageFile: string }>>("spells.json");
  if (!spells) return;

  let count = 0;
  for (const s of spells) {
    await prisma.battleSpell.upsert({
      where: { slug: s.slug },
      update: { name: s.name, description: s.description, imageFile: s.imageFile },
      create: { slug: s.slug, name: s.name, description: s.description, imageFile: s.imageFile },
    });
    count++;
  }
  console.log(`  ✓ Spells: ${count} upserted`);
}

// ---------------------------------------------------------------------------
// Emblems
// ---------------------------------------------------------------------------
async function seedEmblems() {
  const emblems = readSeed<Array<{
    slug: string; name: string; imageFile: string;
    attrs: { name: string; value: number }[];
    nodes: { tier: number; position: number; name: string; description: string; imageFile: string }[];
  }>>("emblems.json");
  if (!emblems) return;

  // Full wipe-rebuild (same as scraper)
  await prisma.emblemNode.deleteMany();
  await prisma.emblemTree.deleteMany();

  let count = 0;
  for (const e of emblems) {
    const tree = await prisma.emblemTree.create({
      data: { slug: e.slug, name: e.name, imageFile: e.imageFile, attrs: e.attrs },
    });
    for (const node of e.nodes) {
      await prisma.emblemNode.create({
        data: { treeId: tree.id, tier: node.tier, position: node.position, name: node.name, description: node.description, statKey: null, statValue: null, imageFile: node.imageFile },
      });
    }
    count++;
  }
  console.log(`  ✓ Emblems: ${count} trees upserted`);
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------
async function seedSkills() {
  const skills = readSeed<Array<{ heroSlug: string; slot: string; name: string; description: string; imageFile: string }>>("skills.json");
  if (!skills) return;

  // Build slug→id map
  const heroes = await prisma.hero.findMany({ select: { id: true, slug: true } });
  const heroMap = new Map(heroes.map((h) => [h.slug, h.id]));

  let count = 0;
  let skipped = 0;
  for (const s of skills) {
    const heroId = heroMap.get(s.heroSlug);
    if (!heroId) { skipped++; continue; }
    const slot = s.slot as import("@prisma/client").SkillSlot;
    await prisma.skill.upsert({
      where: { heroId_slot: { heroId, slot } },
      update: { name: s.name, description: s.description, imageFile: s.imageFile },
      create: { heroId, slot, name: s.name, description: s.description, imageFile: s.imageFile },
    });
    count++;
  }
  if (skipped > 0) console.warn(`  ⚠  Skills: ${skipped} skipped (hero not in DB — run db:seed for heroes first)`);
  console.log(`  ✓ Skills: ${count} upserted`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
async function main() {
  console.log("🌱  Loading seed files from data/seeds/...\n");

  await seedHeroes();
  await seedItems();
  await seedSpells();
  await seedEmblems();
  await seedSkills();

  console.log("\n✨  Seed complete.");
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
