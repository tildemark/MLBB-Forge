import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function checkAuth(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  const qt = req.nextUrl.searchParams.get("t");
  return auth === `Bearer ${secret}` || qt === secret;
}

const OPENMLBB_BASE = "https://openmlbb.fastapicloud.dev/api";

/**
 * Fetch the latest stable MLBB app version + release date from APKMirror RSS.
 * APKMirror publishes an RSS feed per app — clean XML, updated hourly.
 */
async function fetchLiveAppVersion(): Promise<{
  version: string | null;   // e.g. "2.1.47"  (3-part, trimmed build suffix)
  date: string | null;      // ISO 8601 string
}> {
  try {
    const res = await fetch(
      "https://www.apkmirror.com/apk/moonton/mobile-legends-bang-bang/feed/",
      {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "text/xml,application/rss+xml",
        },
        next: { revalidate: 3600 },
      }
    );
    if (!res.ok) return { version: null, date: null };

    const xml = await res.text();
    // Each <item> has <title> with version string and <pubDate>
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(
      (m) => m[1]
    );

    for (const item of items) {
      const titleMatch =
        item.match(/<title><!\[CDATA\[([^\]]+)\]\]><\/title>/) ??
        item.match(/<title>([^<]+)<\/title>/);
      const dateMatch = item.match(/<pubDate>([^<]+)<\/pubDate>/);
      if (!titleMatch || !dateMatch) continue;

      const title = titleMatch[1];
      // Skip beta builds (titles contain "beta")
      if (title.toLowerCase().includes("beta")) continue;

      // Extract version string like "2.1.47" (skip the build suffix .11491)
      const vMatch = title.match(/\b(\d+\.\d+\.\d+)(?:\.\d+)?\b/);
      if (!vMatch) continue;

      const version = vMatch[1];
      const date = new Date(dateMatch[1].trim()).toISOString();
      return { version, date };
    }

    return { version: null, date: null };
  } catch {
    return { version: null, date: null };
  }
}

/**
 * Fetch the current MLBB season number and per-datatype update timestamps
 * from the openmlbb API.
 *
 * "Season" = the `big_rank` field on the hero builds endpoint (e.g. "101").
 * `_updatedAt` on each record type tells us when openmlbb last refreshed that data.
 */
async function fetchLiveVersionInfo(): Promise<{
  season: string | null;
  buildsUpdatedAt: number | null;
  itemsUpdatedAt: number | null;
  spellsUpdatedAt: number | null;
  emblemsUpdatedAt: number | null;
}> {
  const results = await Promise.allSettled([
    // Builds: season number lives in big_rank
    fetch(`${OPENMLBB_BASE}/academy/heroes/miya/builds?lane=gold`, {
      next: { revalidate: 1800 },
    }).then((r) => r.json()),
    // Items
    fetch(`${OPENMLBB_BASE}/academy/equipment/expanded?lang=en&size=1`, {
      next: { revalidate: 1800 },
    }).then((r) => r.json()),
    // Spells
    fetch(`${OPENMLBB_BASE}/academy/spells?lang=en&size=1`, {
      next: { revalidate: 1800 },
    }).then((r) => r.json()),
    // Emblems
    fetch(`${OPENMLBB_BASE}/academy/emblems?lang=en&size=1`, {
      next: { revalidate: 1800 },
    }).then((r) => r.json()),
  ]);

  const [buildsResult, itemsResult, spellsResult, emblemsResult] = results;

  const buildsJson   = buildsResult.status  === "fulfilled" ? buildsResult.value  : null;
  const itemsJson    = itemsResult.status   === "fulfilled" ? itemsResult.value   : null;
  const spellsJson   = spellsResult.status  === "fulfilled" ? spellsResult.value  : null;
  const emblemsJson  = emblemsResult.status === "fulfilled" ? emblemsResult.value : null;

  const buildsRec   = buildsJson?.data?.records?.[0];
  const itemsRec    = itemsJson?.data?.records?.[0];
  const spellsRec   = spellsJson?.data?.records?.[0];
  const emblemsRec  = emblemsJson?.data?.records?.[0];

  const season: string | null = buildsRec?.data?.big_rank
    ? `Season ${buildsRec.data.big_rank}`
    : null;

  return {
    season,
    buildsUpdatedAt:  buildsRec?._updatedAt  ?? null,
    itemsUpdatedAt:   itemsRec?._updatedAt   ?? null,
    spellsUpdatedAt:  spellsRec?._updatedAt  ?? null,
    emblemsUpdatedAt: emblemsRec?._updatedAt ?? null,
  };
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [live, appVersion, latestPatch] = await Promise.all([
    fetchLiveVersionInfo(),
    fetchLiveAppVersion(),
    prisma.patchVersion.findFirst({ where: { isLatest: true } }),
  ]);

  return NextResponse.json({
    /** e.g. "Season 101" — derived from big_rank on openmlbb builds endpoint */
    liveSeasonLabel: live.season,
    /** e.g. "2.1.47" — latest stable app version from APKMirror RSS */
    liveAppVersion: appVersion.version,
    /** ISO 8601 — when that app version was published */
    liveAppVersionDate: appVersion.date,
    /** Unix ms — when openmlbb last refreshed each data type */
    liveUpdatedAt: {
      builds:  live.buildsUpdatedAt,
      items:   live.itemsUpdatedAt,
      spells:  live.spellsUpdatedAt,
      emblems: live.emblemsUpdatedAt,
    },
    /** Our DB's current active patch version string (e.g. "1.8.88") */
    dbPatchVersion: latestPatch?.version ?? null,
    /** When we created/activated this patch version record */
    dbPatchCreatedAt: latestPatch?.createdAt ?? null,
  });
}
