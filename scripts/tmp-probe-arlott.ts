import "dotenv/config";
import { getPageWikitext, withRetry } from "./lib/mediawiki";

async function main() {
  const wikitext = await withRetry(() => getPageWikitext("Arlott"));
  // Print first 3000 chars to find image references
  console.log(wikitext.slice(0, 3000));
}
main();
