import "dotenv/config";
import { withRetry } from "./lib/mediawiki";

const MW_API = "https://mobile-legends.fandom.com/api.php";

async function getWikitext(title: string) {
  const url = `${MW_API}?action=query&titles=${encodeURIComponent(title)}&prop=revisions&rvprop=content&format=json&formatversion=2`;
  const res = await fetch(url);
  const data: any = await res.json();
  return data.query?.pages?.[0]?.revisions?.[0]?.content ?? null;
}

(async () => {
  // Check for a Lua module first
  for (const name of ["Module:BattleSpell/data", "Module:Battle spell/data", "Battle spells", "Battle Spells"]) {
    const wt = await withRetry(() => getWikitext(name));
    if (wt) {
      console.log(`\n=== ${name} (first 1500 chars) ===`);
      console.log(wt.slice(0, 1500));
    }
  }
})();
