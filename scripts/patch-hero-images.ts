/**
 * scripts/patch-hero-images.ts
 *
 * Force-uploads images for specific heroes using multiple strategies.
 * Bypasses the CDN HEAD check (CDN may return 200 for missing files).
 *
 * Usage: npx tsx scripts/patch-hero-images.ts
 */

import "dotenv/config";
import { withRetry } from "./lib/mediawiki";
import { mirrorImageToCDN } from "../lib/oci-storage";
import { slugify } from "./lib/mediawiki";

const MW_API = "https://mobile-legends.fandom.com/api.php";

// Heroes confirmed missing — use their exact wiki page name
const TARGETS = [
  "Lukas",
  "Sora",
  "Hirara",
  "Obsidia",
  "Chip",
  "Arlott",
  "Cici",
  "Fredrinn",
  "Joy",
  "Ixia",
  "Novaria",
  "Suyou",
  "Zetian",
  "Zhuxin",
];

async function getPageThumbnailUrl(heroName: string): Promise<string | null> {
  const params = new URLSearchParams({
    action: "query",
    prop: "pageimages",
    titles: heroName,
    pithumbsize: "480",
    format: "json",
  });
  const res = await fetch(`${MW_API}?${params}`);
  if (!res.ok) return null;
  const data: any = await res.json();
  const pages = Object.values(data.query?.pages ?? {}) as any[];
  // Remove /revision suffix to get original resolution
  return pages[0]?.thumbnail?.source?.replace(/\/revision\/.*$/, "") ?? null;
}

async function getWikiImageUrl(fileName: string): Promise<string | null> {
  const title = fileName.startsWith("File:") ? fileName : `File:${fileName}`;
  const params = new URLSearchParams({
    action: "query",
    prop: "imageinfo",
    titles: title,
    iiprop: "url",
    format: "json",
  });
  const res = await fetch(`${MW_API}?${params}`);
  if (!res.ok) return null;
  const data: any = await res.json();
  const pages = Object.values(data.query?.pages ?? {}) as any[];
  return pages[0]?.imageinfo?.[0]?.url ?? null;
}

async function mirrorHero(wikiName: string): Promise<boolean> {
  const slug = slugify(wikiName);
  const imageFile = slug + ".png";

  // Strategy 1: direct name.png
  try {
    const url = await getWikiImageUrl(wikiName + ".png");
    if (url) {
      await withRetry(() => mirrorImageToCDN(url, "heroes/" + imageFile));
      return true;
    }
  } catch { /* fall through */ }

  // Strategy 2: pageimages thumbnail (works for Hero1234-portrait.png style)
  try {
    const thumbUrl = await getPageThumbnailUrl(wikiName);
    if (thumbUrl) {
      await withRetry(() => mirrorImageToCDN(thumbUrl, "heroes/" + imageFile));
      return true;
    }
  } catch { /* fall through */ }

  return false;
}

async function main() {
  let ok = 0;
  let fail = 0;
  for (const name of TARGETS) {
    process.stdout.write("Patching " + name + "... ");
    const success = await mirrorHero(name);
    if (success) { console.log("✓"); ok++; }
    else { console.log("✗ FAILED"); fail++; }
    await new Promise(r => setTimeout(r, 300));
  }
  console.log(`\nDone. OK: ${ok} | Failed: ${fail}`);
}
main().catch(e => { console.error(e); process.exit(1); });
