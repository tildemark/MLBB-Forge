import "dotenv/config";
import { getPageWikitext, withRetry } from "./lib/mediawiki";

async function main() {
  const lua = await withRetry(() => getPageWikitext("Module:Hero/data"));
  // Find Miya's entry to see the full field list
  const miyaIdx = lua.indexOf('["Miya"]');
  if (miyaIdx >= 0) console.log("MIYA:\n" + lua.slice(miyaIdx, miyaIdx + 800));
  const chipIdx = lua.indexOf('["Chip"]');
  if (chipIdx >= 0) console.log("\nCHIP:\n" + lua.slice(chipIdx, chipIdx + 800));
  // Search for lane-related fields
  const laneIdx = lua.toLowerCase().indexOf("lane");
  console.log("\nlane mention at:", laneIdx);
  if (laneIdx >= 0) console.log(lua.slice(Math.max(0, laneIdx - 100), laneIdx + 300));
}
main();
