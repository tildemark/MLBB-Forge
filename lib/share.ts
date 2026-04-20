/**
 * lib/share.ts
 *
 * Encode/decode the current forge state into a compact URL-safe string so
 * guests can share builds without creating an account.
 *
 * Encoded format (JSON → base64url):
 *   { h: heroSlug, lv: level, items: [slug|null, ...], spell: slug|null, emblem: slug|null, nodes: [nodeId, ...] }
 *
 * Usage:
 *   const param = encodeShareState(state);
 *   const url = `${origin}/?b=${param}`;
 *
 *   const state = decodeShareState(searchParam);
 */

export interface ShareableState {
  /** Hero slug */
  h: string;
  /** Hero level (1–15) */
  lv: number;
  /** 6-element item slug array; null = empty slot */
  items: (string | null)[];
  /** Battle spell slug */
  spell: string | null;
  /** Emblem tree slug */
  emblem: string | null;
  /** Selected EmblemNode IDs (up to 3) */
  nodes: string[];
}

export function encodeShareState(state: ShareableState): string {
  const json = JSON.stringify(state);
  // btoa is available in Node 16+ and all modern browsers
  return btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeShareState(encoded: string): ShareableState | null {
  try {
    // Restore base64 padding
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(padded);
    const parsed = JSON.parse(json) as Partial<ShareableState>;
    if (
      typeof parsed.h !== "string" ||
      typeof parsed.lv !== "number" ||
      !Array.isArray(parsed.items)
    ) {
      return null;
    }
    return {
      h: parsed.h,
      lv: Math.min(15, Math.max(1, parsed.lv)),
      items: (parsed.items as unknown[]).map((s) => (typeof s === "string" ? s : null)),
      spell: typeof parsed.spell === "string" ? parsed.spell : null,
      emblem: typeof parsed.emblem === "string" ? parsed.emblem : null,
      nodes: Array.isArray(parsed.nodes) ? (parsed.nodes as unknown[]).filter((s): s is string => typeof s === "string") : [],
    };
  } catch {
    return null;
  }
}
