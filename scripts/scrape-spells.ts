/**
 * scripts/scrape-spells.ts
 *
 * Fetches battle spells from the openmlbb API (official Moonton data),
 * mirrors icons to OCI CDN, and upserts into PostgreSQL.
 *
 * Usage: npm run scrape:spells
 */

import "dotenv/config";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { prisma } from "../lib/prisma";
import { mirrorImageToCDN } from "../lib/oci-storage";

const OPENMLBB_API = "https://openmlbb.fastapicloud.dev/api";

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Strip <font color="...">text</font> and other HTML tags, clean whitespace */
function cleanDesc(raw: string): string {
  return raw
    .replace(/<font[^>]*>/gi, "")
    .replace(/<\/font>/gi, "")
    .replace(/<[^>]+>/gi, " ")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  console.log("Fetching battle spells from openmlbb API...");
  const res = await fetch(`${OPENMLBB_API}/academy/spells?lang=en&size=50`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const records: any[] = json?.data?.records ?? [];
  console.log(`Got ${records.length} spells.\n`);

  let processed = 0;
  let failed = 0;

  const seedSpells: Array<{ slug: string; name: string; description: string; imageFile: string }> = [];

  for (const record of records) {
    const inner = record?.data?.__data;
    if (!inner?.skillname) continue;

    const name: string = inner.skillname;
    const iconUrl: string = inner.skillicon ?? "";
    const rawDesc: string = inner.skilldesc ?? "";

    const slug = slugify(name);
    const description = cleanDesc(rawDesc);

    process.stdout.write(`[${processed + 1}] ${name}`);

    try {
      const imageFile = `${slug}.png`;

      if (iconUrl) {
        try {
          await mirrorImageToCDN(iconUrl, `spells/${imageFile}`);
          process.stdout.write(" [img ok]");
        } catch {
          process.stdout.write(" [img -]");
        }
      }

      await prisma.battleSpell.upsert({
        where: { slug },
        update: { name, description, imageFile },
        create: { slug, name, description, imageFile },
      });

      seedSpells.push({ slug, name, description, imageFile });
      console.log(" [db ok]");
      processed++;
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      console.log(` [FAILED: ${(err as Error).message}]`);
      failed++;
    }
  }

  // Remove spells that no longer exist in the API data
  const scrapedSpellSlugs = seedSpells.map((s) => s.slug);
  const staleSpells = await prisma.battleSpell.findMany({
    where: { slug: { notIn: scrapedSpellSlugs } },
    select: { id: true, name: true },
  });
  if (staleSpells.length > 0) {
    console.log(`\n🗑  Removing ${staleSpells.length} stale spell(s): ${staleSpells.map((s) => s.name).join(", ")}`);
    await prisma.battleSpell.deleteMany({ where: { id: { in: staleSpells.map((s) => s.id) } } });
  }

  // Save JSON snapshot
  mkdirSync(join(process.cwd(), "data/seeds"), { recursive: true });
  writeFileSync(
    join(process.cwd(), "data/seeds/spells.json"),
    JSON.stringify(seedSpells, null, 2)
  );
  console.log("   Snapshot saved → data/seeds/spells.json");

  console.log(`\n✨  Done. Processed: ${processed} | Failed: ${failed}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
