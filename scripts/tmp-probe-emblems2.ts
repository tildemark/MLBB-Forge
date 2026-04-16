import "dotenv/config";
import { prisma } from "../lib/prisma";
import { getPageWikitext, withRetry } from "./lib/mediawiki";

async function main() {
  // Check what statKey values exist
  const nodes = await prisma.emblemNode.findMany({ select: { tier: true, name: true, statKey: true, statValue: true, description: true }, take: 40 });
  console.log("=== EmblemNode statKey samples ===");
  for (const n of nodes) {
    console.log(`  tier=${n.tier} "${n.name}" key=${n.statKey} val=${n.statValue} desc=${n.description?.slice(0,60)}`);
  }

  // Check wiki for emblem attribute stats (the non-talent base stats)
  const wikitext = await withRetry(() => getPageWikitext("Emblems"));
  // Find the Basic Common block to see attribute stats
  const bcIdx = wikitext.indexOf("Basic Common");
  if (bcIdx >= 0) {
    console.log("\n=== Basic Common section (500 chars) ===");
    console.log(wikitext.slice(bcIdx, bcIdx + 1000));
  }
  await prisma.$disconnect();
}
main();
