/**
 * scripts/fix-hero-images.ts
 *
 * Re-attempts CDN image upload for any hero whose CDN image is missing/broken.
 * Uses the wiki's pageimages and images APIs to find the correct portrait.
 *
 * Usage: npx tsx scripts/fix-hero-images.ts
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { getImageUrl, withRetry } from "./lib/mediawiki";
import { mirrorImageToCDN } from "../lib/oci-storage";

const MW_API = "https://mobile-legends.fandom.com/api.php";
const CDN_BASE = process.env.NEXT_PUBLIC_CDN_URL ?? "https://cdn.sanchez.ph/mlbb/";

async function cdnImageExists(imageFile: string): Promise<boolean> {
  try {
    const res = await fetch(CDN_BASE + "heroes/" + imageFile, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

/** Get the thumbnail/representative image for a wiki page via pageimages API */
async function getPageMainImageUrl(heroName: string): Promise<string | null> {
  const params = new URLSearchParams({
    action: "query",
    prop: "pageimages",
    titles: heroName,
    pithumbsize: "240",
    format: "json",
  });
  const res = await fetch(`${MW_API}?${params}`);
  if (!res.ok) return null;
  const data: any = await res.json();
  const pages = Object.values(data.query?.pages ?? {}) as any[];
  const thumb: string | undefined = pages[0]?.thumbnail?.source;
  if (!thumb) return null;
  // Strip /revision/... suffix to get the original file URL
  return thumb.replace(/\/revision\/.*$/, "");
}

/** Get all images listed on a wiki page and return the first portrait-like one */
async function getPageImages(heroName: string): Promise<string[]> {
  const params = new URLSearchParams({
    action: "query",
    prop: "images",
    titles: heroName,
    imlimit: "20",
    format: "json",
  });
  const res = await fetch(`${MW_API}?${params}`);
  if (!res.ok) return [];
  const data: any = await res.json();
  const pages = Object.values(data.query?.pages ?? {}) as any[];
  return (pages[0]?.images ?? []).map((img: any) => img.title as string);
}

async function tryMirrorHero(heroName: string, imageFile: string): Promise<boolean> {
  // Strategy 1: direct name candidates
  const candidates = [
    heroName + ".png",
    heroName + " Head.png",
    heroName.replace(/ /g, "_") + ".png",
    heroName.replace(/ /g, "-") + ".png",
  ];

  for (const candidate of candidates) {
    try {
      const remoteUrl = await withRetry(() => getImageUrl(candidate));
      await withRetry(() => mirrorImageToCDN(remoteUrl, "heroes/" + imageFile));
      return true;
    } catch {
      // try next
    }
  }

  // Strategy 2: use pageimages thumbnail (most reliable for newer heroes)
  try {
    const thumbUrl = await withRetry(() => getPageMainImageUrl(heroName));
    if (thumbUrl) {
      await withRetry(() => mirrorImageToCDN(thumbUrl, "heroes/" + imageFile));
      return true;
    }
  } catch {
    // fall through
  }

  // Strategy 3: scan page images for a portrait-like file (Name_(...).png/jpg)
  try {
    const pageImages = await withRetry(() => getPageImages(heroName));
    const nameLower = heroName.toLowerCase().replace(/ /g, "_");
    // Prefer files containing the hero name and looking like a skin/portrait
    const portrait = pageImages.find((title) => {
      const t = title.toLowerCase();
      return t.includes(nameLower) && (t.endsWith(".png") || t.endsWith(".jpg")) && !t.includes("icon") && !t.includes("comic") && !t.includes("wall") && !t.includes("banner");
    });
    if (portrait) {
      const remoteUrl = await withRetry(() => getImageUrl(portrait.replace(/^File:/, "")));
      await withRetry(() => mirrorImageToCDN(remoteUrl, "heroes/" + imageFile));
      return true;
    }
  } catch {
    // give up
  }

  return false;
}

async function main() {
  const heroes = await prisma.hero.findMany({ select: { name: true, imageFile: true } });
  console.log(`Checking ${heroes.length} heroes...\n`);

  let fixed = 0;
  let alreadyOk = 0;
  let failed = 0;

  for (const hero of heroes) {
    const exists = await cdnImageExists(hero.imageFile);
    if (exists) {
      process.stdout.write(".");
      alreadyOk++;
      continue;
    }

    process.stdout.write("\nMISSING: " + hero.name + " → ");
    const ok = await tryMirrorHero(hero.name, hero.imageFile);
    if (ok) {
      process.stdout.write("✓ fixed");
      fixed++;
    } else {
      process.stdout.write("✗ FAILED");
      failed++;
    }

    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`\n\nDone. Already OK: ${alreadyOk} | Fixed: ${fixed} | Failed: ${failed}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
