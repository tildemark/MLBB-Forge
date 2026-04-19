/**
 * scripts/scrape-skills.ts
 *
 * Fetches hero skills from the openmlbb API (official Moonton data).
 * Falls back to the MLBB Fandom wiki for any heroes missing from the API.
 *
 * Populates the Skill table (one row per hero+slot, upserted).
 * Skill images are mirrored to CDN at skills/{heroSlug}-{slot}.png.
 *
 * Usage:
 *   npm run scrape:skills
 *   npx tsx scripts/scrape-skills.ts
 *   npx tsx scripts/scrape-skills.ts -- Miya Layla   (specific heroes)
 */

import "dotenv/config";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { prisma } from "../lib/prisma";
import {
  getPageWikitext,
  getImageUrl,
  withRetry,
} from "./lib/mediawiki";
import { mirrorImageToCDN } from "../lib/oci-storage";
import type { SkillSlot } from "@prisma/client";

const OPENMLBB_API = "https://openmlbb.fastapicloud.dev/api";

// ---------------------------------------------------------------------------
// openmlbb skill slot mapping
// The skilllist array order: [passive?, skill1, skill2, skill3?, ultimate]
// Heroes with 5 skills: passive+3 actives+ultimate
// Heroes with 4 skills: passive+2 actives+ultimate  (most common)
// Heroes with 3 skills: 2 actives+ultimate (no passive)
// ---------------------------------------------------------------------------
const SLOT_ORDER_5: SkillSlot[] = ["PASSIVE", "S1", "S2", "S3", "S4"];
const SLOT_ORDER_4: SkillSlot[] = ["PASSIVE", "S1", "S2", "S4"];
const SLOT_ORDER_3: SkillSlot[] = ["S1", "S2", "S4"];

function getSlotOrder(count: number): SkillSlot[] {
  if (count >= 5) return SLOT_ORDER_5;
  if (count === 4) return SLOT_ORDER_4;
  return SLOT_ORDER_3;
}

function stripHtmlTags(text: string): string {
  return text
    .replace(/<font[^>]*>/gi, "").replace(/<\/font>/gi, "")
    .replace(/<[^>]+>/gi, " ").replace(/\n/g, " ").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Fetch skills from openmlbb for one hero (by slug)
// Returns null if not found
// ---------------------------------------------------------------------------
async function fetchSkillsFromApi(heroSlug: string): Promise<Array<{slot: SkillSlot; name: string; description: string; iconUrl: string}> | null> {
  try {
    const res = await fetch(`${OPENMLBB_API}/heroes/${encodeURIComponent(heroSlug)}?lang=en`);
    if (!res.ok) return null;
    const json = await res.json();
    const heroData = json?.data?.records?.[0]?.data?.hero?.data;
    // heroskilllist is an array of skill sets; first set contains the active skill list
    const skilllist: any[] = heroData?.heroskilllist?.[0]?.skilllist ?? [];
    if (!skilllist.length) return null;
    const slots = getSlotOrder(skilllist.length);

    return skilllist.map((skill: any, i: number) => ({
      slot: slots[i] ?? "S4",
      name: skill.skillname ?? `Skill ${i + 1}`,
      description: stripHtmlTags(skill.skilldesc ?? ""),
      iconUrl: skill.skillicon ?? "",
    }));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Wiki fallback helpers (kept for heroes missing from openmlbb)
// ---------------------------------------------------------------------------
function getParam(block: string, key: string): string | null {
  const esc = key.replace(/[.+*?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `\\|\\s*${esc}\\s*=\\s*([\\s\\S]*?)(?=\\|\\s*[\\w.-]+\\s*=|\\}\\})`,
    "i"
  );
  const m = block.match(re);
  if (!m) return null;
  return m[1].replace(/<[^>]+>/g, "").replace(/\{\{[^}]+\}\}/g, "").replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, "$2").replace(/\s+/g, " ").trim();
}

function extractSection(wikitext: string, title: string): string | null {
  const esc = title.replace(/[.+*?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`===\\s*${esc}\\s*===([\\s\\S]*?)(?====|==|$)`, "i");
  const m = wikitext.match(re);
  return m ? m[1] : null;
}

function extractAbilityBlock(section: string): string | null {
  const startIdx = section.search(/\{\{[Aa]bility/);
  if (startIdx === -1) return null;
  let depth = 0;
  let i = startIdx;
  while (i < section.length) {
    if (section[i] === "{" && section[i + 1] === "{") { depth++; i += 2; continue; }
    if (section[i] === "}" && section[i + 1] === "}") { depth--; i += 2; if (depth === 0) return section.slice(startIdx, i); continue; }
    i++;
  }
  return section.slice(startIdx);
}

function cleanDescWiki(text: string): string {
  return text
    .replace(/\{\{scale\|[^}]*\}\}/g, "[X]")
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, "$2")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const WIKI_SLOT_MAP: { slot: SkillSlot; titles: string[] }[] = [
  { slot: "PASSIVE", titles: ["Passive"] },
  { slot: "S1",      titles: ["Skill 1", "Skill1", "Active"] },
  { slot: "S2",      titles: ["Skill 2", "Skill2"] },
  { slot: "S3",      titles: ["Skill 3", "Skill3"] },
  { slot: "S4",      titles: ["Ultimate"] },
];

async function tryGetSkillImageUrl(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    try { return await withRetry(() => getImageUrl(candidate)); } catch { /* try next */ }
  }
  return null;
}

async function fetchSkillsFromWiki(hero: { name: string; slug: string }): Promise<Array<{slot: SkillSlot; name: string; description: string; imageFile: string; iconUrl: string}> | null> {
  const wikitext = await withRetry(() => getPageWikitext(hero.name));
  const abilitiesIdx = wikitext.search(/==\s*Abilit/i);
  if (abilitiesIdx === -1) return null;
  const afterAbilities = wikitext.slice(abilitiesIdx);
  const endMatch = afterAbilities.slice(2).search(/^==[^=]/m);
  const abilitiesBlock = endMatch > 0 ? afterAbilities.slice(0, endMatch + 2) : afterAbilities;

  const results = [];
  for (const { slot, titles } of WIKI_SLOT_MAP) {
    let section: string | null = null;
    for (const title of titles) { section = extractSection(abilitiesBlock, title); if (section) break; }
    if (!section) continue;
    const block = extractAbilityBlock(section);
    if (!block) continue;
    const name = getParam(block, "name") ?? `${hero.name} ${slot}`;
    const description = cleanDescWiki(getParam(block, "description") ?? "");
    const imageParam = getParam(block, "image-legend") ?? getParam(block, "image");
    const slotLabel = slot.toLowerCase();
    const candidates = [
      imageParam ? `${imageParam}.png` : null,
      `${name}.png`, `${hero.name} ${name}.png`, `${hero.name}${name}.png`,
      `${hero.name} ${slotLabel}.png`,
    ].filter((c): c is string => !!c);
    const wikiUrl = await tryGetSkillImageUrl(candidates);
    results.push({ slot, name, description, imageFile: `${hero.slug}-${slotLabel}.png`, iconUrl: wikiUrl ?? "" });
  }
  return results.length > 0 ? results : null;
}

export { tryGetSkillImageUrl };

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const filterArgs = process.argv.slice(3);

  const heroes = await prisma.hero.findMany({
    select: { id: true, slug: true, name: true },
    orderBy: { name: "asc" },
  });

  const targets = filterArgs.length > 0
    ? heroes.filter((h) => filterArgs.some((a) => a.toLowerCase() === h.name.toLowerCase() || a.toLowerCase() === h.slug))
    : heroes;

  console.log(`Scraping skills for ${targets.length} heroes...\n`);

  let processed = 0, failed = 0, apiCount = 0, wikiCount = 0;

  const seedSkills: Array<{ heroSlug: string; slot: SkillSlot; name: string; description: string; imageFile: string }> = [];

  for (const hero of targets) {
    process.stdout.write(`[${processed + 1}/${targets.length}] ${hero.name}`);

    try {
      // Try openmlbb API first
      const apiSkills = await fetchSkillsFromApi(hero.slug);

      if (apiSkills) {
        process.stdout.write(" [api]");
        apiCount++;
        let skillsFound = 0;
        for (const { slot, name, description, iconUrl } of apiSkills) {
          const imageFile = `${hero.slug}-${slot.toLowerCase()}.png`;
          if (iconUrl) {
            try {
              await mirrorImageToCDN(iconUrl, `skills/${imageFile}`);
            } catch { /* not fatal */ }
          }
          await prisma.skill.upsert({
            where: { heroId_slot: { heroId: hero.id, slot } },
            create: { heroId: hero.id, slot, name, description, imageFile },
            update: { name, description, imageFile },
          });
          seedSkills.push({ heroSlug: hero.slug, slot, name, description, imageFile });
          skillsFound++;
        }
        console.log(` [${skillsFound} skills]`);
      } else {
        // Fallback: parse wiki page
        process.stdout.write(" [wiki]");
        wikiCount++;
        const wikiSkills = await fetchSkillsFromWiki(hero);
        if (!wikiSkills) {
          console.log(" [no abilities found]");
          processed++;
          continue;
        }
        let skillsFound = 0;
        for (const { slot, name, description, imageFile, iconUrl } of wikiSkills) {
          if (iconUrl) {
            try { await withRetry(() => mirrorImageToCDN(iconUrl, `skills/${imageFile}`)); } catch { /* not fatal */ }
          }
          await prisma.skill.upsert({
            where: { heroId_slot: { heroId: hero.id, slot } },
            create: { heroId: hero.id, slot, name, description, imageFile },
            update: { name, description, imageFile },
          });
          seedSkills.push({ heroSlug: hero.slug, slot, name, description, imageFile });
          skillsFound++;
        }
        console.log(` [${skillsFound} skills]`);
        await new Promise((r) => setTimeout(r, 400)); // wiki rate limit
      }

      processed++;
      await new Promise((r) => setTimeout(r, 150));
    } catch (err) {
      console.log(` [FAILED: ${(err as Error).message.slice(0, 60)}]`);
      failed++;
    }
  }

  if (filterArgs.length === 0) {
    mkdirSync(join(process.cwd(), "data/seeds"), { recursive: true });
    writeFileSync(join(process.cwd(), "data/seeds/skills.json"), JSON.stringify(seedSkills, null, 2));
    console.log("   Snapshot saved → data/seeds/skills.json");
  }

  console.log(`\nDone. Processed: ${processed} | Failed: ${failed} (api: ${apiCount}, wiki fallback: ${wikiCount})`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
