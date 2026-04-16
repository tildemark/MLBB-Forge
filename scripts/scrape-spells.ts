/**
 * scripts/scrape-spells.ts
 *
 * Scrapes battle spells from the "Battle spells" page on the MLBB Fandom wiki,
 * uploads icons to OCI CDN, and upserts into PostgreSQL.
 *
 * Usage: npm run scrape:spells
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { getPageWikitext, getImageUrl, slugify, withRetry } from "./lib/mediawiki";
import { mirrorImageToCDN } from "../lib/oci-storage";

async function main() {
  console.log("Fetching Battle spells page...");
  const wikitext = await withRetry(() => getPageWikitext("Battle spells"));

  // Extract {{Spell-box-skill|...}} template blocks
  const blocks: string[] = [];
  const openRe = /\{\{Spell-box-skill\s*\|/gi;
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(wikitext)) !== null) {
    let depth = 2;
    let i = m.index + m[0].length;
    while (i < wikitext.length && depth > 0) {
      if (wikitext[i] === "{" && wikitext[i + 1] === "{") { depth += 2; i += 2; }
      else if (wikitext[i] === "}" && wikitext[i + 1] === "}") { depth -= 2; i += 2; }
      else i++;
    }
    blocks.push(wikitext.slice(m.index + 2, i - 2));
  }

  console.log(`Found ${blocks.length} spell templates.\n`);

  let processed = 0;
  let failed = 0;

  for (const block of blocks) {
    const get = (key: string) => {
      const r = block.match(new RegExp(`\\|\\s*${key}\\s*=\\s*([^|\\n}][^|\\n}]*)`));
      return r ? r[1].trim() : null;
    };

    const name = get("name");
    if (!name) continue;

    const slug = slugify(name);
    const rawDescription = get("description") ?? "";
    // Strip wiki markup: {{scale|...}}, {{b|text|...}}, [[...]], <br>, ''...''
    const description = rawDescription
      .replace(/\{\{scale\|[^}]*\}\}/gi, "")
      .replace(/\{\{b\|([^|]+)\|[^}]*\}\}/gi, "$1")
      .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/''/g, "")
      .replace(/\s+/g, " ")
      .trim();

    process.stdout.write(`[${processed + 1}] ${name}`);

    try {
      // Upload icon — try "name.png" first, then "image" param
      const imageParam = get("image") ?? name;
      let imageFile = `${slug}.png`;
      try {
        const remoteUrl = await withRetry(() => getImageUrl(`${imageParam}.png`));
        await withRetry(() => mirrorImageToCDN(remoteUrl, `spells/${imageFile}`));
        process.stdout.write(" [img ok]");
      } catch {
        process.stdout.write(" [img -]");
      }

      await prisma.battleSpell.upsert({
        where: { slug },
        update: { name, description, imageFile },
        create: { slug, name, description, imageFile },
      });

      console.log(" [db ok]");
      processed++;
      await new Promise((r) => setTimeout(r, 200));
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
