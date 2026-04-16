import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  const patches = await prisma.patchVersion.findMany();
  console.log("Patches:", patches.map(p => `${p.version} isLatest=${p.isLatest} id=${p.id}`));

  const heroCount = await prisma.hero.count();
  const statsCount = await prisma.heroStats.count();
  console.log(`Heroes: ${heroCount}, HeroStats rows: ${statsCount}`);

  // Check a few specific heroes
  const layla = await prisma.hero.findFirst({ where: { slug: "layla" }, include: { stats: true } });
  if (layla) {
    console.log("\nLayla stats rows:", layla.stats.length);
    if (layla.stats[0]) {
      const s = layla.stats[0];
      console.log("  baseHp:", s.baseHp, "hpGrowth:", s.hpGrowth);
      console.log("  baseAtkPhys:", s.baseAtkPhys, "atkPhysGrowth:", s.atkPhysGrowth);
      console.log("  patchId:", s.patchId);
    }
  }
}
main().finally(() => prisma.$disconnect());
