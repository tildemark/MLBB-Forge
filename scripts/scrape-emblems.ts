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
import { prisma } from "../lib/prisma";
import { getPageWikitext, getImageUrl, slugify, withRetry } from "./lib/mediawiki";
import { mirrorImageToCDN } from "../lib/oci-storage";

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
    // Some talent lines embed |imageN=... immediately after the name
    const inlineImageKey = `image${position}`;
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
  console.log("Fetching Emblems page...");
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

      for (const node of nodes) {
        let nodeImageFile = `${slugify(node.name)}.png`;
        const wikiImageName = node.image ? `${node.image}.png` : `${node.name}.png`;
        try {
          const nodeUrl = await withRetry(() => getImageUrl(wikiImageName));
          await withRetry(() => mirrorImageToCDN(nodeUrl, `talents/${nodeImageFile}`));
        } catch {
          // not fatal
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
      }

      console.log(" [db✓]");
      processed++;
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      console.log(` [FAILED: ${(err as Error).message}]`);
      failed++;
    }
  }

  console.log(`\nDone. Processed: ${processed} | Failed: ${failed}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
