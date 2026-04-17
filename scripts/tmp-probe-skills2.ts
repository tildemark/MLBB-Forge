import "dotenv/config";
import { getPageWikitext } from "./lib/mediawiki";

async function main() {
const wt = await getPageWikitext("Miya");
const idx = wt.indexOf("{{Herobox skill");
if (idx >= 0) {
  console.log(wt.slice(idx, idx + 3000));
} else {
  // Try other section names
  for (const kw of ["== Abilit", "==Abilit", "skill_name", "skill_1", "|passive", "|active", "Herobox_skill", "herobox skill"]) {
    const i = wt.toLowerCase().indexOf(kw.toLowerCase());
    if (i >= 0) { console.log(`Found '${kw}' at ${i}:`); console.log(wt.slice(Math.max(0, i - 50), i + 3000)); break; }
  }
  const heroboxIdx = wt.indexOf("{{Herobox");
  if (heroboxIdx >= 0) console.log("\nHerobox at:", heroboxIdx, "\n", wt.slice(heroboxIdx, heroboxIdx + 500));
}
}
main().catch(console.error);
