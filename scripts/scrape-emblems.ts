/**
 * scripts/scrape-emblems.ts
 *
 * Scrapes emblem sets (trees) and all their talent nodes from the "Emblems"
 * page on the MLBB Fandom wiki.
 *
 * Tier mapping:
 *   tier 1 = standard talents row 1 (standardtalent1.*)
 *   tier 2 = standard talents row 2 (standardtalent2.*)
 *   tier 3 = core talents           (coretalent3.*)
 *
 * Usage:
 *   npm run scrape:emblems
 */

import "dotenv/config";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { prisma } from "../lib/prisma";
import { getPageWikitext, getImageUrl, slugify, withRetry } from "./lib/mediawiki";
import { mirrorImageToCDN, uploadToCDN } from "../lib/oci-storage";

const OPENMLBB_API = "https://openmlbb.fastapicloud.dev/api";

// ---------------------------------------------------------------------------
// Fetch talent icon URLs from openmlbb API (keyed by lowercase talent name)
// ---------------------------------------------------------------------------
async function fetchTalentIconMap(): Promise<Map<string, string>> {
  const res = await fetch(`${OPENMLBB_API}/academy/emblems?lang=en&size=100`);
  if (!res.ok) throw new Error(`openmlbb /academy/emblems HTTP ${res.status}`);
  const json = await res.json();
  const records: any[] = json?.data?.records ?? [];
  const map = new Map<string, string>();
  for (const record of records) {
    const skill = record?.data?.emblemskill;
    if (skill?.skillname && skill?.skillicon) {
      const key = skill.skillname.toLowerCase();
      map.set(key, skill.skillicon);
      // Also store a de-pluralized variant so e.g. "Weapons Master" matches "Weapon Master"
      if (key.endsWith("s")) map.set(key.slice(0, -1), skill.skillicon);
    }
  }
  console.log(`  Loaded ${map.size} talent icons from openmlbb API`);
  // Debug: print all known talent names so mismatches are visible
  for (const k of [...map.keys()].sort()) process.stdout.write(`    api-key: "${k}"\n`);
  return map;
}

// ---------------------------------------------------------------------------
// Extract value of a named param from a template block.
// Handles multi-line values — runs until the next pipe-param or closing }}
// ---------------------------------------------------------------------------
function getParam(block: string, key: string): string | null {
  const escapedKey = key.replace(/[.+*?^${}()|[\]\\]/g, "\\$&");
  // Look for |key= or | key = — value runs until the next |something= or }}
  const re = new RegExp(
    `\\|\\s*${escapedKey}\\s*=\\s*([\\s\\S]*?)(?=\\|\\s*[\\w.-]+\\s*=|\\}\\})`,
    "i"
  );
  const m = block.match(re);
  if (!m) return null;
  return m[1].replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Parse a single emblem-set template block
// ---------------------------------------------------------------------------
function parseEmblemTemplate(block: string) {
  const name = (getParam(block, "name") ?? "Unknown").trim();

  const attrs: { key: string; value: string }[] = [];
  for (let i = 1; i <= 3; i++) {
    const k = getParam(block, `attr${i}`);
    const v = getParam(block, `attr-val${i}`);
    if (k) attrs.push({ key: k.trim(), value: (v ?? "").trim() });
  }

  // Match talent name params: |standardtalent1.1= Foo  or  |coretalent3.2= Bar
  const nodes: {
    tier: number;
    position: number;
    name: string;
    description: string;
    image: string | null;
  }[] = [];

  const talentRe = /\|\s*(standard|core)talent(\d+)\.(\d+)\s*=\s*([^\n|]+?)(?=\||\}\})/gi;
  let m: RegExpExecArray | null;
  while ((m = talentRe.exec(block)) !== null) {
    const type = m[1].toLowerCase();
    const tier = parseInt(m[2]);
    const position = parseInt(m[3]);
    const talentName = m[4].trim();
    const descKey = `${type}talent-descr${tier}.${position}`;
    const description = getParam(block, descKey) ?? "";
    // |imageN=... uses the TIER number as N (not the position within the tier)
    const inlineImageKey = `image${tier}`;
    const inlineImage = getParam(block, inlineImageKey);
    nodes.push({ tier, position, name: talentName, description, image: inlineImage ?? null });
  }

  return { name, attrs, nodes };
}

// ---------------------------------------------------------------------------
// Emblem set icon filenames on the wiki (try candidates in order)
// ---------------------------------------------------------------------------
const TREE_ICON_MAP: Record<string, string[]> = {
  "Basic Common":    ["Common Emblem.png", "Basic Common Emblem.png"],
  "Custom Tank":     ["Tank Emblem.png", "Custom Tank Emblem.png"],
  "Custom Assassin": ["Assassin Emblem.png", "Custom Assassin Emblem.png"],
  "Custom Mage":     ["Mage Emblem.png", "Custom Mage Emblem.png"],
  "Custom Fighter":  ["Fighter Emblem.png", "Custom Fighter Emblem.png"],
  "Custom Marksman": ["Marksman Emblem.png", "Custom Marksman Emblem.png"],
  "Custom Support":  ["Support Emblem.png", "Custom Support Emblem.png"],
};

async function tryGetImageUrl(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    try {
      return await withRetry(() => getImageUrl(candidate));
    } catch {
      // try next candidate
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("Pre-fetching talent icon URLs from openmlbb...");
  const talentIconMap = await fetchTalentIconMap();

  console.log("\nFetching Emblems page...");
  const wikitext = await withRetry(() => getPageWikitext("Emblems"));

  // Extract all {{New-*-emblem-set|...}} template blocks using brace-depth matching
  const templateBlocks: string[] = [];
  const openRe = /\{\{New-(?:basic|custom)-emblem-set\|/gi;
  let openMatch: RegExpExecArray | null;
  while ((openMatch = openRe.exec(wikitext)) !== null) {
    let depth = 2;
    let i = openMatch.index + openMatch[0].length;
    while (i < wikitext.length && depth > 0) {
      if (wikitext[i] === "{" && wikitext[i + 1] === "{") { depth += 2; i += 2; }
      else if (wikitext[i] === "}" && wikitext[i + 1] === "}") { depth -= 2; i += 2; }
      else i++;
    }
    templateBlocks.push(wikitext.slice(openMatch.index + 2, i - 2));
  }

  console.log(`Found ${templateBlocks.length} emblem set templates.\n`);

  // Parse all blocks first so we can verify before touching the DB
  const parsed = templateBlocks.map(parseEmblemTemplate);
  console.log("Parsed sets:");
  for (const p of parsed) {
    console.log(`  • ${p.name}: ${p.nodes.length} nodes`);
  }
  console.log();

  // Clean slate re-scrape
  await prisma.emblemNode.deleteMany();
  await prisma.emblemTree.deleteMany();
  console.log("Cleared existing emblem data.\n");

  let processed = 0;
  let failed = 0;

  const seedEmblems: Array<{
    slug: string; name: string; imageFile: string;
    attrs: { name: string; value: number }[];
    nodes: { tier: number; position: number; name: string; description: string; imageFile: string }[];
  }> = [];

  for (const { name, attrs, nodes } of parsed) {
    const slug = slugify(name);
    process.stdout.write(`[${processed + 1}/${parsed.length}] ${name} (${nodes.length} nodes)`);

    try {
      // Upload tree icon
      let imageFile = `${slug}-emblem.png`;
      const candidates = TREE_ICON_MAP[name] ?? [`${name} Emblem.png`];
      const remoteUrl = await tryGetImageUrl(candidates);
      if (remoteUrl) {
        try {
          await withRetry(() => mirrorImageToCDN(remoteUrl, `emblems/${imageFile}`));
          process.stdout.write(" [img✓]");
        } catch {
          process.stdout.write(" [img-]");
        }
      } else {
        process.stdout.write(" [no img]");
      }

      // Parse attrs: "+275" → 275
      const attrData = attrs.map((a) => ({
        name: a.key,
        value: parseFloat(a.value.replace(/[^0-9.]/g, "")) || 0,
      }));

      const tree = await prisma.emblemTree.create({
        data: { slug, name, imageFile, attrs: attrData },
      });

      const seedNodes: { tier: number; position: number; name: string; description: string; imageFile: string }[] = [];

      for (const node of nodes) {
        const nodeLabel = `    T${node.tier}.${node.position} "${node.name}"`;
        process.stdout.write(`${nodeLabel} ...`);
        const baseSlug = slugify(node.name);
        const cacheBust = Math.floor(Date.now() / 1000);
        let nodeImageFile = `${baseSlug}.png?v=${cacheBust}`; // query param busts CDN edge cache
        const nodeOciKey = `${baseSlug}.png`;                 // OCI key has no query param
        let uploaded = false;

        // Priority 1: wiki image (fandom is hand-curated and most reliable for correctness).
        // Force-overwrite via uploadToCDN so stale CDN files are always updated.
        const wikiCandidates = [
          node.image ? `${node.image}.png` : null,   // e.g. "Inspire (Talent).png", "Weapon Master (Talent).png"
          `${node.name}.png`,                         // e.g. "Bargain Hunter.png"
          `Talent ${node.name}.png`,
          `Emblem talent ${node.name}.png`,
        ].filter((c): c is string => !!c);
        const wikiUrl = await tryGetImageUrl(wikiCandidates);
        if (wikiUrl) {
          try {
            const imgRes = await fetch(wikiUrl);
            if (imgRes.ok) {
              const buf = Buffer.from(await imgRes.arrayBuffer());
              const ct = imgRes.headers.get("content-type") ?? "image/png";
              await uploadToCDN(`talents/${nodeOciKey}`, buf, ct);
              uploaded = true;
              process.stdout.write(` icon=wiki ✓\n`);
            } else {
              process.stdout.write(` wiki-fetch ${imgRes.status}`);
            }
          } catch {
            process.stdout.write(` wiki-err`);
          }
        } else {
          process.stdout.write(` [no wiki img]`);
        }

        // Priority 2: openmlbb API icon — fallback only when wiki has nothing.
        // Note: the API skillicon field can map to incorrect assets for some talents,
        // so wiki is preferred when available.
        if (!uploaded) {
          const apiIconUrl = talentIconMap.get(node.name.toLowerCase());
          if (apiIconUrl) {
            try {
              const imgRes = await fetch(apiIconUrl);
              if (imgRes.ok) {
                const buf = Buffer.from(await imgRes.arrayBuffer());
                const ct = imgRes.headers.get("content-type") ?? "image/png";
                await uploadToCDN(`talents/${nodeOciKey}`, buf, ct);
                uploaded = true;
                process.stdout.write(` icon=api ✓\n`);
              } else {
                process.stdout.write(` api-fetch ${imgRes.status}`);
              }
            } catch {
              process.stdout.write(` api-err`);
            }
          } else {
            process.stdout.write(` [no api match]`);
          }
          if (!uploaded) {
            process.stdout.write(` *** MISSING ICON ***\n`);
          }
        }

        await prisma.emblemNode.create({
          data: {
            treeId: tree.id,
            tier: node.tier,
            position: node.position,
            name: node.name,
            description: node.description,
            statKey: null,
            statValue: null,
            imageFile: nodeImageFile,
          },
        });
        seedNodes.push({ tier: node.tier, position: node.position, name: node.name, description: node.description, imageFile: nodeImageFile });
      }

      seedEmblems.push({ slug, name, imageFile, attrs: attrData, nodes: seedNodes });
      console.log(" [db✓]");
      processed++;
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      console.log(` [FAILED: ${(err as Error).message}]`);
      failed++;
    }
  }

  // Save JSON snapshot
  mkdirSync(join(process.cwd(), "data/seeds"), { recursive: true });
  writeFileSync(
    join(process.cwd(), "data/seeds/emblems.json"),
    JSON.stringify(seedEmblems, null, 2)
  );
  console.log("   Snapshot saved → data/seeds/emblems.json");

  console.log(`\nDone. Processed: ${processed} | Failed: ${failed}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
