import "dotenv/config";
import { getImageUrl, slugify, withRetry } from "./lib/mediawiki";

const HEROES = ["Arlott", "Chip", "Cici", "Fredrinn", "Harara", "Joy", "Ixia", "Lucas", "Novaria", "Obsidian", "Sora", "Suyou", "Zetian", "Zhu Xin"];

async function main() {
  for (const n of HEROES) {
    const candidates = [
      n + ".png",
      n + " Head.png",
      n.replace(/ /g, "_") + ".png",
      n.replace(/ /g, "-") + ".png",
      n.replace(/ /g, "") + ".png",
    ];
    let found = false;
    for (const c of candidates) {
      try {
        const url = await withRetry(() => getImageUrl(c), 2, 500);
        console.log("OK   [" + n + "] " + c);
        found = true;
        break;
      } catch {
        // try next
      }
    }
    if (!found) console.log("NONE [" + n + "]");
  }
}
main();
