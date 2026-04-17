/**
 * scripts/lib/mediawiki.ts
 *
 * Typed wrapper around the MLBB Fandom MediaWiki API.
 * Docs: https://mlbb.fandom.com/api.php
 */

const MW_API = "https://mobile-legends.fandom.com/api.php";

/** Generic MW API query response envelope */
interface MWQueryResponse<T> {
  batchcomplete?: string;
  continue?: Record<string, string>;
  query: T;
}

// ---------------------------------------------------------------------------
// Category members (list all pages in a category)
// ---------------------------------------------------------------------------
export interface MWCategoryMember {
  pageid: number;
  ns: number;
  title: string;
}

interface MWCategoryQuery {
  categorymembers: MWCategoryMember[];
}

export async function getCategoryMembers(
  category: string,
  limit = 500
): Promise<MWCategoryMember[]> {
  const members: MWCategoryMember[] = [];
  let continueToken: string | undefined;

  do {
    const params = new URLSearchParams({
      action: "query",
      list: "categorymembers",
      cmtitle: `Category:${category}`,
      cmlimit: String(limit),
      cmnamespace: "0",
      format: "json",
      ...(continueToken ? { cmcontinue: continueToken } : {}),
    });

    const res = await fetch(`${MW_API}?${params}`);
    if (!res.ok)
      throw new Error(`MW API error: ${res.status} ${res.statusText}`);

    const data: MWQueryResponse<MWCategoryQuery> & {
      continue?: { cmcontinue: string };
    } = await res.json();

    members.push(...data.query.categorymembers);
    continueToken = data.continue?.cmcontinue;
  } while (continueToken);

  return members;
}

// ---------------------------------------------------------------------------
// Page wikitext (raw markup)
// ---------------------------------------------------------------------------
interface MWRevisionsQuery {
  pages: Record<
    string,
    {
      pageid: number;
      title: string;
      revisions: [{ slots: { main: { "*": string } } }];
    }
  >;
}

export async function getPageWikitext(title: string): Promise<string> {
  const params = new URLSearchParams({
    action: "query",
    prop: "revisions",
    titles: title,
    rvprop: "content",
    rvslots: "main",
    format: "json",
    formatversion: "1",
  });

  const res = await fetch(`${MW_API}?${params}`);
  if (!res.ok) throw new Error(`MW API error: ${res.status} ${res.statusText}`);

  const data: MWQueryResponse<MWRevisionsQuery> = await res.json();
  const pages = Object.values(data.query.pages);
  if (!pages[0]?.revisions?.[0])
    throw new Error(`No wikitext for page: ${title}`);

  return pages[0].revisions[0].slots.main["*"];
}

// ---------------------------------------------------------------------------
// Image info (get actual download URL for a File: page)
// ---------------------------------------------------------------------------
interface MWImageInfoQuery {
  pages: Record<
    string,
    {
      pageid: number;
      title: string;
      imageinfo: [{ url: string; descriptionurl: string }];
    }
  >;
}

export async function getImageUrl(fileName: string): Promise<string> {
  // fileName can be "File:BladeosDespair.png" or just "BladeosDespair.png"
  const title = fileName.startsWith("File:") ? fileName : `File:${fileName}`;

  const params = new URLSearchParams({
    action: "query",
    prop: "imageinfo",
    titles: title,
    iiprop: "url",
    format: "json",
  });

  const res = await fetch(`${MW_API}?${params}`);
  if (!res.ok) throw new Error(`MW API error: ${res.status} ${res.statusText}`);

  const data: MWQueryResponse<MWImageInfoQuery> = await res.json();
  const pages = Object.values(data.query.pages);
  const url = pages[0]?.imageinfo?.[0]?.url;
  if (!url) throw new Error(`No image URL for: ${fileName}`);

  return url;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Slugify a wiki page title → URL-safe lowercase string */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Simple exponential back-off retry wrapper */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs * attempt));
    }
  }
  throw new Error("Unreachable");
}
