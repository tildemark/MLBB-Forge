import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  const heroes = await prisma.hero.findMany({
    take: 5,
    select: { name: true, lane: true, specialty: true, resource: true, dmgType: true, atkType: true },
    orderBy: { name: "asc" },
  });
  for (const h of heroes) console.log(h);
  await prisma.$disconnect();
}

main().catch(console.error);
