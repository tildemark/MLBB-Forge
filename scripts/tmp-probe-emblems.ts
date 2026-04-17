import "dotenv/config";
import { getPageWikitext } from "./lib/mediawiki";
import fs from "fs";

async function main() {
  const text = await getPageWikitext("Emblems");
  fs.writeFileSync("scripts/tmp-emblems-dump.txt", text);
  console.log("Written", text.length, "chars");
  console.log("---FIRST 6000---");
  console.log(text.slice(0, 6000));
}
main();
