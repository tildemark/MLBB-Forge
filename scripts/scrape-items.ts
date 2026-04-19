/**
 * scripts/scrape-items.ts
 *
 * Fetches item stats, icons, and passive text from the openmlbb API.
 * Gold costs are fetched from the MLBB wiki Module:Equipment/data (only field missing from API).
 *
 * Usage: npm run scrape:items
 */

import "dotenv/config";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { ItemCategory } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { getPageWikitext, slugify, withRetry } from "./lib/mediawiki";
import { parseEquipmentModule } from "./lib/lua-parser";
import type { ParsedBonuses } from "./lib/lua-parser";
import { mirrorImageToCDN } from "../lib/oci-storage";

const OPENMLBB_API = "https://openmlbb.fastapicloud.dev/api";
const PATCH_VERSION = process.env.SCRAPE_PATCH ?? "1.8.88";

interface ApiItem {
  equipname: string;
  equipicon: string;
  equiptips: string;
  equipskilldesc: string;
  equiptypename: string;
  targetequipid: string;
  equipid: number;
}

/** Fetch all items from openmlbb API. Filters out enchantment variants (names with " - "). */
async function fetchAllItemsFromAPI(): Promise<ApiItem[]> {
  const all: ApiItem[] = [];
  let index = 1;
  while (true) {
    const res = await fetch(`${OPENMLBB_API}/academy/equipment/expanded?lang=en&size=50&index=${index}`);
    if (!res.ok) break;
    const json = await res.json();
    const records: any[] = json?.data?.records ?? [];
    if (records.length === 0) break;
    for (const r of records) {
      const d = r?.data;
      if (d?.equipname && d?.equipicon && !d.equipname.includes(" - ")) {
        all.push({
          equipname: d.equipname,
          equipicon: d.equipicon,
          equiptips: d.equiptips ?? "",
          equipskilldesc: d.equipskilldesc ?? "",
          equiptypename: d.equiptypename ?? "",
          targetequipid: d.targetequipid ?? "",
          equipid: d.equipid ?? 0,
        });
      }
    }
    if (records.length < 50) break;
    index++;
  }
  console.log(`  openmlbb: loaded ${all.length} items from API`);
  return all;
}

const EMPTY_BONUSES: ParsedBonuses = {
  hp: 0, mana: 0, physAtk: 0, magPower: 0, physDef: 0, magDef: 0,
  physPenFlat: 0, physPenPct: 0, magPenFlat: 0, magPenPct: 0,
  critRate: 0, critDamage: 0, attackSpeed: 0, lifeSteal: 0,
  spellVamp: 0, cdr: 0, moveSpeed: 0, hpRegen: 0, manaRegen: 0,
};

/**
 * Parse the API's equiptips field into stat bonus fields.
 * Format: "+924 HP<br>+40 Physical Defense<br>+10% CD Reduction<br>"
 * Percent-based stats are stored as decimals (e.g. 20% → 0.20).
 */
function parseEquipTips(tips: string): ParsedBonuses {
  const result = { ...EMPTY_BONUSES };
  const entries = tips.split(/<br\s*\/?>/i).map(s => s.replace(/<[^>]+>/g, "").trim()).filter(Boolean);
  for (const entry of entries) {
    const m = entry.match(/^\+?([\d.]+)(%?)\s+(.+)$/i);
    if (!m) continue;
    const value = parseFloat(m[1]);
    const isPct = m[2] === "%";
    const pct = isPct ? value / 100 : value;
    const stat = m[3].toLowerCase().trim();

    if (stat === "hp")                                           result.hp = value;
    else if (stat === "mana")                                    result.mana = value;
    else if (stat === "physical attack")                         result.physAtk = value;
    else if (stat === "magic power")                             result.magPower = value;
    else if (stat === "physical defense")                        result.physDef = value;
    else if (stat === "magic defense")                           result.magDef = value;
    // "Penetration" alone = magic pen (Arcane Boots), "Magic Penetration" also magic
    else if (stat === "penetration" || stat === "magic penetration") result.magPenFlat = value;
    else if (stat === "physical penetration")                    result.physPenFlat = value;
    else if (stat.includes("attack speed") || stat === "extra attack speed") result.attackSpeed = pct;
    else if (stat === "crit rate" || stat === "crit chance" || stat === "critical rate") result.critRate = pct;
    else if (stat === "crit damage" || stat === "critical damage")   result.critDamage = pct;
    else if (stat === "cd reduction" || stat === "cooldown reduction") result.cdr = pct;
    else if (stat === "movement speed")                          result.moveSpeed = value;
    else if (stat === "lifesteal" || stat === "life steal")      result.lifeSteal = pct;
    else if (stat === "spell vamp")                              result.spellVamp = pct;
    else if (stat === "hp regen")                                result.hpRegen = value;
    else if (stat === "mana regen")                              result.manaRegen = value;
  }
  return result;
}

/** Strip HTML tags and clean up whitespace from equipskilldesc. */
function cleanPassiveDesc(raw: string): string {
  return raw
    .replace(/<font[^>]*>/gi, "")
    .replace(/<\/font>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Extract passiveName and passiveDesc from equipskilldesc.
 * e.g. "\nPassive - Doom: Dealing damage..." → passiveName="Doom"
 */
function extractPassive(skilldesc: string): { passiveName: string | null; passiveDesc: string | null } {
  const cleaned = cleanPassiveDesc(skilldesc);
  if (!cleaned || /^[\s\n:]*$/.test(cleaned)) return { passiveName: null, passiveDesc: null };

  // Find first colon — everything before it (minus "Passive/Active -" prefix) is the name
  const colonIdx = cleaned.indexOf(":");
  if (colonIdx === -1) return { passiveName: null, passiveDesc: cleaned };

  const rawName = cleaned.slice(0, colonIdx).replace(/^[\n\s]*(passive|active)\s*[-–]\s*/i, "").trim();
  const passiveName = rawName || null;
  return { passiveName, passiveDesc: cleaned };
}

const CATEGORY_MAP: Record<string, ItemCategory> = {
  "attack":                   ItemCategory.ATTACK,
  "attack & magic":           ItemCategory.ATTACK,
  "attack, magic & defense":  ItemCategory.ATTACK,
  "magic":                    ItemCategory.MAGIC,
  "defense":                  ItemCategory.DEFENSE,
  "movement":                 ItemCategory.MOVEMENT,
  "roam":                     ItemCategory.ROAMING,
  "roaming":                  ItemCategory.ROAMING,
  "jungle":                   ItemCategory.JUNGLING,
  "jungling":                 ItemCategory.JUNGLING,
};

function resolveCategory(typeName: string): ItemCategory {
  return CATEGORY_MAP[typeName.toLowerCase()] ?? ItemCategory.ATTACK;
}

async function main() {
  console.log("Fetching all items from openmlbb API...");
  const apiItems = await fetchAllItemsFromAPI();

  // Fetch wiki once to build a gold cost map (price is not in the API)
  console.log("\nFetching Module:Equipment/data for gold costs...");
  let goldCostMap = new Map<string, number>();
  try {
    const lua = await withRetry(() => getPageWikitext("Module:Equipment/data"));
    const wikiItems = parseEquipmentModule(lua);
    for (const w of wikiItems) {
      if (w.price != null) goldCostMap.set(w.name.toLowerCase(), w.price);
    }
    console.log(`  wiki: loaded gold costs for ${goldCostMap.size} items`);
  } catch (err) {
    console.warn(`  wiki fetch failed (gold costs will be 0): ${(err as Error).message}`);
  }

  const patch = await prisma.patchVersion.upsert({
    where: { version: PATCH_VERSION },
    update: {},
    create: { version: PATCH_VERSION, isLatest: true },
  });

  const seedItems: any[] = [];
  let processed = 0;
  let failed = 0;

  for (const item of apiItems) {
    try {
      process.stdout.write(`[${processed + 1}/${apiItems.length}] ${item.equipname}`);
      const slug = slugify(item.equipname);
      const imageFile = `${slug}.png`;

      // Mirror icon to CDN
      try {
        await mirrorImageToCDN(item.equipicon, `items/${imageFile}`);
        process.stdout.write(" [img✓]");
      } catch {
        process.stdout.write(" [img-]");
      }

      const bonuses = parseEquipTips(item.equiptips);
      const goldCost = goldCostMap.get(item.equipname.toLowerCase()) ?? 0;
      const { passiveName, passiveDesc } = extractPassive(item.equipskilldesc);
      // Final items have no targetequipid; components do
      const tier = item.targetequipid ? 1 : 3;

      const dbItem = await prisma.item.upsert({
        where: { slug },
        update: { name: item.equipname, category: resolveCategory(item.equiptypename), tier, imageFile, updatedAt: new Date() },
        create: { slug, name: item.equipname, category: resolveCategory(item.equiptypename), tier, imageFile },
      });

      await prisma.itemStats.upsert({
        where: { itemId_patchId: { itemId: dbItem.id, patchId: patch.id } },
        update: { ...bonuses, goldCost, passiveName, passiveDesc },
        create: { itemId: dbItem.id, patchId: patch.id, ...bonuses, goldCost, passiveName, passiveDesc },
      });

      seedItems.push({ slug, name: item.equipname, category: resolveCategory(item.equiptypename), tier, imageFile, stats: { ...bonuses, goldCost, passiveName, passiveDesc } });
      console.log(" ✅");
      processed++;
      await new Promise((r) => setTimeout(r, 100));
    } catch (err) {
      console.log(` ❌ ${(err as Error).message}`);
      failed++;
    }
  }

  // Save JSON snapshot
  mkdirSync(join(process.cwd(), "data/seeds"), { recursive: true });
  writeFileSync(
    join(process.cwd(), "data/seeds/items.json"),
    JSON.stringify({ patch: PATCH_VERSION, items: seedItems }, null, 2)
  );
  console.log("\n   Snapshot saved → data/seeds/items.json");

  // Remove items no longer present in API data
  const scrapedSlugs = apiItems.map((i) => slugify(i.equipname));
  const staleItems = await prisma.item.findMany({
    where: { slug: { notIn: scrapedSlugs } },
    select: { id: true, name: true },
  });
  if (staleItems.length > 0) {
    console.log(`\n🗑  Removing ${staleItems.length} stale item(s): ${staleItems.map((i) => i.name).join(", ")}`);
    await prisma.itemStats.deleteMany({ where: { itemId: { in: staleItems.map((i) => i.id) } } });
    await prisma.item.deleteMany({ where: { id: { in: staleItems.map((i) => i.id) } } });
  }

  console.log(`\n✨  Done. Processed: ${processed} | Failed: ${failed}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
