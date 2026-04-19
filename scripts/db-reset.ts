/**
 * scripts/db-reset.ts
 *
 * Clears all scraped data from the database in dependency order.
 * Preserves auth users/sessions/accounts.
 *
 * Usage: npm run db:reset
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  console.log("Clearing database (scraped data only)...\n");

  const r = (label: string, n: { count: number }) =>
    console.log(`  deleted ${String(n.count).padStart(4)}  ${label}`);

  // Leaf tables first (no outbound FK)
  r("SkillScaling",  await prisma.skillScaling.deleteMany());
  r("BuildItem",     await prisma.buildItem.deleteMany());
  r("Build",         await prisma.build.deleteMany());
  r("Skill",         await prisma.skill.deleteMany());
  r("HeroStats",     await prisma.heroStats.deleteMany());
  r("ItemStats",     await prisma.itemStats.deleteMany());
  r("ItemComponent", await prisma.itemComponent.deleteMany());
  r("Item",          await prisma.item.deleteMany());
  r("Hero",          await prisma.hero.deleteMany());
  r("BattleSpell",   await prisma.battleSpell.deleteMany());
  r("EmblemNode",    await prisma.emblemNode.deleteMany());
  r("EmblemTree",    await prisma.emblemTree.deleteMany());
  r("PatchVersion",  await prisma.patchVersion.deleteMany());

  console.log("\nDone. DB cleared.");
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
