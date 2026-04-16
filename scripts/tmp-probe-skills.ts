import "dotenv/config";
import { getPageWikitext, withRetry } from "./lib/mediawiki";

async function main() {
  const wikitext = await withRetry(() => getPageWikitext("Miya"));
  // Find skill section
  const skillIdx = wikitext.indexOf("==Skills==");
  if (skillIdx >= 0) {
    console.log(wikitext.slice(skillIdx, skillIdx + 3000));
  } else {
    console.log("No ==Skills== section found");
    // Try alternative
    const s2 = wikitext.indexOf("skill");
    console.log("'skill' at:", s2);
    console.log(wikitext.slice(Math.max(0, s2-50), s2+500));
  }
}
main();
