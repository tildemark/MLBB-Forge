import "dotenv/config";
import { getImageUrl } from "./lib/mediawiki";

async function main() {
  const names = ["Miya", "Yu Zhong", "X.Borg", "Layla", "Aldous", "Lolita"];
  for (const n of names) {
    const candidates = [
      n + ".png",
      n + " Head.png",
      n.replace(/ /g, "_") + ".png",
      n.replace(/ /g, "-") + ".png",
    ];
    let found = false;
    for (const c of candidates) {
      try {
        const url = await getImageUrl(c);
        console.log("OK   " + c + " -> " + url.slice(0, 80));
        found = true;
        break;
      } catch {
        console.log("FAIL " + c);
      }
    }
    if (!found) console.log("NONE found for " + n);
  }
}
main();
