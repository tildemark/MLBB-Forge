/**
 * scripts/scrape-icons.ts
 *
 * Fetches official in-game role and lane icons from the Moonton API
 * (via openmlbb proxy) and mirrors them to the OCI CDN under:
 *   roles/fighter.png, roles/assassin.png, etc.
 *   lanes/gold-lane.png, lanes/exp-lane.png, etc.
 *
 * Usage: npm run scrape:icons
 */

import "dotenv/config";
import { mirrorImageToCDN } from "../lib/oci-storage";

const OPENMLBB_API = "https://openmlbb.fastapicloud.dev/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function uploadIcon(sourceUrl: string, cdnPath: string): Promise<boolean> {
  try {
    await mirrorImageToCDN(sourceUrl, cdnPath);
    return true;
  } catch (err) {
    process.stdout.write(` [FAILED: ${(err as Error).message}]`);
    return false;
  }
}

// Normalize sort_title to a CDN filename key
function slugRole(title: string): string | null {
  const t = title.toLowerCase().trim();
  const map: Record<string, string> = {
    tank: "tank", fighter: "fighter", assassin: "assassin",
    mage: "mage", marksman: "marksman", support: "support",
  };
  return map[t] ?? null;
}

function slugLane(title: string): string | null {
  const t = title.toLowerCase().trim();
  if (t === "gold lane" || t === "gold") return "gold-lane";
  if (t === "exp lane" || t === "exp") return "exp-lane";
  if (t === "mid lane" || t === "mid") return "mid-lane";
  if (t === "roam") return "roam";
  if (t === "jungle") return "jungle";
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Fetching hero positions to collect role/lane icon URLs...");

  // Fetch a few pages to ensure we collect all 5 lanes and 6 roles
  const roleMap = new Map<string, string>(); // slug → iconUrl
  const laneMap = new Map<string, string>(); // slug → iconUrl

  let index = 1;
  while (roleMap.size < 6 || laneMap.size < 5) {
    const data = await fetchJson(`${OPENMLBB_API}/heroes/positions?size=20&index=${index}&lang=en`);
    const records: any[] = data?.data?.records ?? [];
    if (records.length === 0) break;

    for (const record of records) {
      const hero = record?.data?.hero?.data;
      if (!hero) continue;

      for (const roleEntry of hero.sortid ?? []) {
        const rd = roleEntry?.data;
        if (!rd?.sort_icon || !rd?.sort_title) continue;
        const slug = slugRole(rd.sort_title);
        if (slug && !roleMap.has(slug)) roleMap.set(slug, rd.sort_icon);
      }

      for (const laneEntry of hero.roadsort ?? []) {
        const ld = laneEntry?.data;
        if (!ld?.road_sort_icon || !ld?.road_sort_title) continue;
        const slug = slugLane(ld.road_sort_title);
        if (slug && !laneMap.has(slug)) laneMap.set(slug, ld.road_sort_icon);
      }
    }

    index++;
    if (index > 10) break; // safety cap
  }

  console.log(`\nCollected ${roleMap.size} roles, ${laneMap.size} lanes.\n`);

  let ok = 0, fail = 0;

  console.log("── Role icons ──────────────────────────────");
  for (const [slug, url] of roleMap) {
    process.stdout.write(`  ${slug.padEnd(12)}`);
    // Detect extension from URL (some are .svg, some .png)
    const ext = url.includes(".svg") ? "svg" : "png";
    const success = await uploadIcon(url, `roles/${slug}.${ext}`);
    console.log(success ? " ✓" : " ✗");
    success ? ok++ : fail++;
  }

  console.log("\n── Lane icons ──────────────────────────────");
  for (const [slug, url] of laneMap) {
    process.stdout.write(`  ${slug.padEnd(12)}`);
    const ext = url.includes(".svg") ? "svg" : "png";
    const success = await uploadIcon(url, `lanes/${slug}.${ext}`);
    console.log(success ? " ✓" : " ✗");
    success ? ok++ : fail++;
  }

  console.log(`\nDone. ${ok} uploaded, ${fail} failed.`);

  // Print a summary of the CDN filenames for updating the UI constants
  console.log("\n── CDN file summary ────────────────────────");
  console.log("Roles:");
  for (const [slug, url] of roleMap) {
    const ext = url.includes(".svg") ? "svg" : "png";
    console.log(`  ${slug} → roles/${slug}.${ext}`);
  }
  console.log("Lanes:");
  for (const [slug, url] of laneMap) {
    const ext = url.includes(".svg") ? "svg" : "png";
    console.log(`  ${slug} → lanes/${slug}.${ext}`);
  }
}

main().catch(console.error);
