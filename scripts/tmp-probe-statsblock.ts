import "dotenv/config";
import { getPageWikitext, withRetry } from "./lib/mediawiki";

async function main() {
  const lua = await withRetry(() => getPageWikitext("Module:Hero/data"));
  
  // Find Miya's full block
  const miyaIdx = lua.indexOf('["Miya"]');
  // Find next hero after Miya
  const nextIdx = lua.indexOf('\n\t["', miyaIdx + 10);
  const block = lua.slice(miyaIdx, nextIdx);
  
  console.log("Block length:", block.length);
  
  // Check if ["stats"] exists in block
  const statsIdx = block.indexOf('["stats"]');
  console.log('"["stats"] index in block:', statsIdx);
  
  if (statsIdx >= 0) {
    console.log("Stats section (200 chars from stats start):");
    console.log(block.slice(statsIdx, statsIdx + 500));
  }
  
  // Try the regex
  const statsMatch = block.match(/\["stats"\]\s*=\s*\{([\s\S]*?)\}/);
  console.log("\n--- Regex match result:");
  console.log("matched:", !!statsMatch);
  if (statsMatch) {
    console.log("capture group:", statsMatch[1].slice(0, 300));
  }
}
main();
