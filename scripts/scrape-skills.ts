/**
 * scripts/scrape-skills.ts
 *
 * Scrapes hero abilities from the MLBB Fandom wiki.
 * Each hero page has an ==Abilities== section with ===Passive===, ===Skill 1===,
 * ===Skill 2===, ===Ultimate=== subsections containing {{Ability|...}} templates.
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
import { prisma } from "../lib/prisma";
import {
  getPageWikitext,
  getImageUrl,
  slugify,
  withRetry,
} from "./lib/mediawiki";
import { mirrorImageToCDN } from "../lib/oci-storage";
import type { SkillSlot } from "@prisma/client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the value of a template param. Value ends at the next |param= or }} */
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

/** Find the content of a section header (===Title===) *)
 *  Returns text up to the next === or == header */
function extractSection(wikitext: string, title: string): string | null {
  const esc = title.replace(/[.+*?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`===\\s*${esc}\\s*===([\\s\\S]*?)(?====|==|$)`, "i");
  const m = wikitext.match(re);
  return m ? m[1] : null;
}

/** Extract the first {{Ability|...}} block from a section */
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

/** Clean wiki markup from description text */
function cleanDesc(text: string): string {
  return text
    .replace(/\{\{scale\|[^}]*\}\}/g, "[X]") // damage formulas → [X]
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, "$2")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Slot label → SkillSlot enum + section title
const SLOT_MAP: { label: string; slot: SkillSlot; titles: string[] }[] = [
  { label: "passive", slot: "PASSIVE", titles: ["Passive"] },
  { label: "s1",      slot: "S1",      titles: ["Skill 1", "Skill1", "Active"] },
  { label: "s2",      slot: "S2",      titles: ["Skill 2", "Skill2"] },
  { label: "s3",      slot: "S3",      titles: ["Skill 3", "Skill3"] },
  { label: "ult",     slot: "S4",      titles: ["Ultimate"] },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const filterArgs = process.argv.slice(3); // names after "--"

  const heroes = await prisma.hero.findMany({
    select: { id: true, slug: true, name: true },
    orderBy: { name: "asc" },
  });

  const targets = filterArgs.length > 0
    ? heroes.filter((h) => filterArgs.some((a) => a.toLowerCase() === h.name.toLowerCase() || a.toLowerCase() === h.slug))
    : heroes;

  console.log(`Scraping skills for ${targets.length} heroes...\n`);

  let processed = 0;
  let failed = 0;

  for (const hero of targets) {
    process.stdout.write(`[${processed + 1}/${targets.length}] ${hero.name}`);

    try {
      const wikitext = await withRetry(() => getPageWikitext(hero.name));
      const abilitiesIdx = wikitext.search(/==\s*Abilit/i);
      if (abilitiesIdx === -1) {
        console.log(" [no abilities section]");
        processed++;
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }
      // Slice from ==Abilities== to the next == section
      const afterAbilities = wikitext.slice(abilitiesIdx);
      const endMatch = afterAbilities.slice(2).search(/^==[^=]/m);
      const abilitiesBlock = endMatch > 0
        ? afterAbilities.slice(0, endMatch + 2)
        : afterAbilities;

      let skillsFound = 0;

      for (const { slot, titles } of SLOT_MAP) {
        let section: string | null = null;
        for (const title of titles) {
          section = extractSection(abilitiesBlock, title);
          if (section) break;
        }
        if (!section) continue;

        const block = extractAbilityBlock(section);
        if (!block) continue;

        const name = getParam(block, "name") ?? `${hero.name} ${slot}`;
        const description = cleanDesc(getParam(block, "description") ?? "");
        const imageLegend = getParam(block, "image-legend");
        const wikiImageName = imageLegend ? `${imageLegend}.png` : `${name}.png`;
        const imageFile = `${hero.slug}-${slot.toLowerCase()}.png`;

        // Mirror skill icon
        try {
          const imgUrl = await withRetry(() => getImageUrl(wikiImageName));
          await withRetry(() => mirrorImageToCDN(imgUrl, `skills/${imageFile}`));
        } catch {
          // not fatal — skill exists without icon
        }

        // Upsert Skill row
        await prisma.skill.upsert({
          where: { heroId_slot: { heroId: hero.id, slot } },
          create: { heroId: hero.id, slot, name, description, imageFile },
          update: { name, description, imageFile },
        });

        skillsFound++;
      }

      console.log(` [${skillsFound} skills]`);
      processed++;
      await new Promise((r) => setTimeout(r, 400));
    } catch (err) {
      console.log(` [FAILED: ${(err as Error).message.slice(0, 60)}]`);
      failed++;
    }
  }

  console.log(`\nDone. Processed: ${processed} | Failed: ${failed}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
