/**
 * scripts/scrape-items.ts
 *
 * Fetches all item data from Module:Equipment/data on the MLBB wiki,
 * uploads images to OCI CDN, and upserts records into PostgreSQL.
 *
 * Usage: npm run scrape:items
 */

import "dotenv/config";
import { ItemCategory } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { getPageWikitext, getImageUrl, slugify, withRetry } from "./lib/mediawiki";
import { parseEquipmentModule, parseBonusString } from "./lib/lua-parser";
import { mirrorImageToCDN } from "../lib/oci-storage";

const PATCH_VERSION = process.env.SCRAPE_PATCH ?? "1.8.88";

const CATEGORY_MAP: Record<string, ItemCategory> = {
  attack:   ItemCategory.ATTACK,
  magic:    ItemCategory.MAGIC,
  defense:  ItemCategory.DEFENSE,
  movement: ItemCategory.MOVEMENT,
  roaming:  ItemCategory.ROAMING,
  jungling: ItemCategory.JUNGLING,
};

function resolveCategory(type: string | null): ItemCategory {
  if (!type) return ItemCategory.ATTACK;
  return CATEGORY_MAP[type.toLowerCase()] ?? ItemCategory.ATTACK;
}

async function main() {
  console.log("📦  Fetching Module:Equipment/data...");
  const lua = await withRetry(() => getPageWikitext("Module:Equipment/data"));
  const items = parseEquipmentModule(lua);
  console.log(`   Parsed ${items.length} items from the data module.\n`);

  const patch = await prisma.patchVersion.upsert({
    where: { version: PATCH_VERSION },
    update: {},
    create: { version: PATCH_VERSION, isLatest: true },
  });

  let processed = 0;
  let failed = 0;

  for (const raw of items) {
    try {
      process.stdout.write(`[${processed + 1}/${items.length}] ${raw.name}`);
      const slug = slugify(raw.name);
      const imageFile = `${slug}.png`;

      // Upload image to OCI CDN
      try {
        const remoteUrl = await withRetry(() => getImageUrl(`${raw.name}.png`));
        await withRetry(() => mirrorImageToCDN(remoteUrl, `items/${imageFile}`));
        process.stdout.write(" 🖼");
      } catch (imgErr: any) {
        process.stdout.write(` ⚠ IMG:${imgErr.message?.slice(0, 80)}`);
      }

      const bonuses = parseBonusString(raw.bonus, raw.unique);
      const tier = raw.recipe.length === 0 ? 1 : raw.recipe.length <= 2 ? 2 : 3;

      const item = await prisma.item.upsert({
        where: { slug },
        update: { name: raw.name, category: resolveCategory(raw.type), tier, imageFile, updatedAt: new Date() },
        create: { slug, name: raw.name, category: resolveCategory(raw.type), tier, imageFile },
      });

      await prisma.itemStats.upsert({
        where: { itemId_patchId: { itemId: item.id, patchId: patch.id } },
        update: {
          ...bonuses,
          goldCost: raw.price ?? 0,
          passiveName: raw.passive ? raw.passive.split(":")[0].trim() : null,
          passiveDesc: raw.passive ?? null,
        },
        create: {
          itemId: item.id,
          patchId: patch.id,
          ...bonuses,
          goldCost: raw.price ?? 0,
          passiveName: raw.passive ? raw.passive.split(":")[0].trim() : null,
          passiveDesc: raw.passive ?? null,
        },
      });

      console.log(" ✅");
      processed++;
      await new Promise((r) => setTimeout(r, 150));
    } catch (err) {
      console.log(` ❌ ${(err as Error).message}`);
      failed++;
    }
  }

  console.log(`\n✨  Done. Processed: ${processed} | Failed: ${failed}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
