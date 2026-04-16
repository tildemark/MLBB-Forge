import "dotenv/config";
import { getPageWikitext, withRetry } from "./lib/mediawiki";

async function main() {
  const wikitext = await withRetry(() => getPageWikitext("Hero specialties"));
  // Print first 5000 chars
  console.log(wikitext.slice(0, 5000));
}
main();
