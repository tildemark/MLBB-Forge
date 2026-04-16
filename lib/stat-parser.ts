/**
 * lib/stat-parser.ts
 *
 * Parses raw stat bonuses from freeform description strings
 * (skill descriptions, talent descriptions, spell descriptions)
 * and returns an ItemStats-compatible object.
 *
 * Handles wiki markup like {{template|...}}, [[Link|Text]], etc.
 */

import type { ItemStats } from "./calc";

/** Strip wiki markup and template braces, leaving plain text. */
function clean(text: string): string {
  return text
    .replace(/\{\{[^{}]*\}\}/g, "") // {{template|...}}
    .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, "$1") // [[Link|Label]] → Label
    .replace(/<[^>]+>/g, "") // HTML tags
    .replace(/'''?/g, "") // bold/italic wiki
    .trim();
}

/** Parse a number that may be a range like "55-75" — returns the higher value. */
function parseNum(s: string): number {
  const parts = s.split("-").map((p) => parseFloat(p.trim()));
  return Math.max(...parts.filter((n) => !isNaN(n)));
}

/**
 * Extract numeric value and optional % from a captured group pair.
 * e.g. "65" "%" → 65
 */
function num(match: RegExpMatchArray, idx = 1): number {
  return parseNum(match[idx]);
}

export function parseStatEffects(description: string): ItemStats {
  const text = clean(description);
  const stats: ItemStats = {};

  const add = (key: keyof ItemStats, value: number) => {
    (stats as Record<string, number>)[key] = ((stats as Record<string, number>)[key] ?? 0) + value;
  };

  // ── Movement Speed % ─────────────────────────────────────────────────────
  // "65% extra Movement Speed", "+30% Movement Speed", "gaining 65% extra Movement Speed"
  for (const m of text.matchAll(
    /([+-]?\d+(?:\.\d+)?(?:-\d+)?)\s*%\s*(?:extra\s+)?(?:movement speed|move speed)/gi
  )) add("moveSpeedPct", num(m));

  // ── HP ───────────────────────────────────────────────────────────────────
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s+(?:extra\s+)?(?:max\s+)?hp\b/gi))
    add("hp", num(m));

  // ── Physical Attack ───────────────────────────────────────────────────────
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s+(?:extra\s+)?physical\s+attack(?!\s+speed)/gi))
    add("physAtk", num(m));

  // ── Magic Power ───────────────────────────────────────────────────────────
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s+(?:extra\s+)?magic\s+power/gi))
    add("magPower", num(m));

  // ── Adaptive Attack ───────────────────────────────────────────────────────
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s+(?:extra\s+)?adaptive\s+attack/gi))
    add("adaptiveAtk", num(m));

  // ── Adaptive Penetration / Hybrid Penetration ─────────────────────────────
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s+(?:extra\s+)?(?:adaptive|hybrid)\s+pen(?:etration)?/gi))
    add("hybridPen", num(m));

  // ── Attack Speed % ────────────────────────────────────────────────────────
  for (const m of text.matchAll(
    /([+-]?\d+(?:\.\d+)?(?:-\d+)?)\s*%\s*(?:extra\s+)?attack\s+speed/gi
  )) add("atkSpd", num(m));

  // ── Attack Speed flat (e.g. "+55-75 Attack Speed") ───────────────────────
  for (const m of text.matchAll(/\+(\d+(?:\.\d+)?(?:-\d+)?)\s+attack\s+speed\b(?!\s*%)/gi))
    add("atkSpd", num(m));

  // ── Crit Chance / Rate ────────────────────────────────────────────────────
  for (const m of text.matchAll(
    /([+-]?\d+(?:\.\d+)?)\s*%\s*(?:extra\s+)?crit(?:ical)?\s*(?:chance|rate)/gi
  )) add("critRate", num(m));

  // ── Crit Damage ───────────────────────────────────────────────────────────
  for (const m of text.matchAll(
    /([+-]?\d+(?:\.\d+)?)\s*%\s*(?:extra\s+)?crit(?:ical)?\s*(?:damage|dmg)/gi
  )) add("critDmg", num(m));

  // ── Cooldown Reduction ────────────────────────────────────────────────────
  for (const m of text.matchAll(
    /(?:cooldown\s*(?:reduction)?\s*(?:is\s+)?(?:increased\s+by\s+)?|cd\s+(?:is\s+)?(?:reduced\s+by\s+)?)(\d+(?:\.\d+)?)\s*%/gi
  )) add("cd", num(m));

  // ── Armor (Physical Defense) ──────────────────────────────────────────────
  // Must check "Physical & Magic Defense" first to avoid double-counting armor
  const physAndMagDef = text.match(
    /(\d+(?:\.\d+)?)\s+(?:extra\s+)?physical\s*(?:&|and|\+)\s*magic\s+def(?:ense)?/i
  );
  if (physAndMagDef) {
    add("armor",  parseNum(physAndMagDef[1]));
    add("magRes", parseNum(physAndMagDef[1]));
  } else {
    for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s+(?:extra\s+)?physical\s+def(?:ense)?/gi))
      add("armor", num(m));
    for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s+(?:extra\s+)?magic\s+def(?:ense)?/gi))
      add("magRes", num(m));
  }

  // ── Spell Vamp / Lifesteal ─────────────────────────────────────────────────
  for (const m of text.matchAll(/([+-]?\d+(?:\.\d+)?)\s*%\s+spell\s+vamp/gi))
    add("magLifesteal", num(m));
  for (const m of text.matchAll(/([+-]?\d+(?:\.\d+)?)\s*%\s+(?:physical\s+)?lifesteal/gi))
    add("lifesteal", num(m));

  // ── Physical Penetration (flat) ───────────────────────────────────────────
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s+(?:extra\s+)?physical\s+pen(?:etration)?(?!\s*%)/gi))
    add("physPen", num(m));

  // ── Magic Penetration (flat) ──────────────────────────────────────────────
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s+(?:extra\s+)?magic\s+pen(?:etration)?(?!\s*%)/gi))
    add("magPen", num(m));

  // ── Mana Regen / HP Regen ─────────────────────────────────────────────────
  // (these are rare in skill descriptions but appear in talents like Inspire)
  for (const m of text.matchAll(/mana\s+regen(?:eration)?\s+by\s+(\d+(?:\.\d+)?)/gi))
    add("hpRegen", num(m)); // approximated as hpRegen since we lack a manaRegen field in ItemStats

  return stats;
}

/** Returns true if the parsed stats object has any meaningful stat bonus. */
export function hasStatEffects(stats: ItemStats): boolean {
  return Object.values(stats).some((v) => typeof v === "number" && v !== 0);
}

/** Format parsed stats as short labels for UI display. */
export function formatStatEffects(stats: ItemStats): string {
  const MAP: Partial<Record<keyof ItemStats, string>> = {
    hp:            "HP",
    mana:          "Mana",
    physAtk:       "Phys ATK",
    magPower:      "Mag PWR",
    adaptiveAtk:   "Adaptive ATK",
    armor:         "Armor",
    magRes:        "Mag RES",
    moveSpeed:     "MV SPD",
    moveSpeedPct:  "MV SPD%",
    atkSpd:        "ATK SPD",
    critRate:      "Crit Rate",
    critDmg:       "Crit DMG",
    physPen:       "Phys PEN",
    magPen:        "Mag PEN",
    hybridPen:     "Hybrid PEN",
    lifesteal:     "Lifesteal",
    magLifesteal:  "Spell Vamp",
    cd:            "CDR",
  };
  const pct = new Set<keyof ItemStats>(["moveSpeedPct", "atkSpd", "critRate", "critDmg", "lifesteal", "magLifesteal", "cd"]);
  return Object.entries(stats)
    .filter(([, v]) => typeof v === "number" && v !== 0)
    .map(([k, v]) => {
      const label = MAP[k as keyof ItemStats] ?? k;
      const suffix = pct.has(k as keyof ItemStats) ? "%" : "";
      return `+${v}${suffix} ${label}`;
    })
    .join("  ");
}
