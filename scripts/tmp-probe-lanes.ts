import "dotenv/config";
import { getPageWikitext, withRetry } from "./lib/mediawiki";

async function main() {
  // Check if Hero specialties has laning section
  const specs = await withRetry(() => getPageWikitext("Hero specialties"));
  const laneIdx = specs.toLowerCase().indexOf("lane");
  console.log("=== Hero specialties - 'lane' mention at index:", laneIdx);
  if (laneIdx >= 0) console.log(specs.slice(Math.max(0, laneIdx - 100), laneIdx + 500));

  // Check List of heroes for table structure
  console.log("\n=== List of heroes (first 4000 chars) ===");
  const list = await withRetry(() => getPageWikitext("List of heroes"));
  console.log(list.slice(0, 4000));
}
main();
