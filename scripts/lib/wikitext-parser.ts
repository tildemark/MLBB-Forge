/**
 * scripts/lib/wikitext-parser.ts
 *
 * Utility functions for extracting structured data from MLBB Fandom wikitext.
 * All parsers target the specific infobox/template patterns used on the wiki.
 */

// ---------------------------------------------------------------------------
// Generic template value extractor
// ---------------------------------------------------------------------------

/**
 * Extract a named parameter from a wikitext template.
 *
 * Example: extractParam(wikitext, "attack") → "234"
 */
export function extractParam(wikitext: string, param: string): string | null {
  // Matches "|param = value" or "|param=value", multi-line
  const regex = new RegExp(
    `\\|\\s*${escapeRegex(param)}\\s*=\\s*([^|{}\\n]+)`,
    "i"
  );
  const match = wikitext.match(regex);
  return match ? match[1].trim() : null;
}

/** Extract a numeric parameter, stripping wiki markup like [[...]] */
export function extractNumber(
  wikitext: string,
  param: string
): number | null {
  const raw = extractParam(wikitext, param);
  if (!raw) return null;
  const clean = raw.replace(/\[\[.*?\]\]/g, "").replace(/[^\d.]/g, "");
  const num = parseFloat(clean);
  return isNaN(num) ? null : num;
}

// ---------------------------------------------------------------------------
// Hero infobox parser
// ---------------------------------------------------------------------------

export interface RawHeroData {
  name: string;
  title: string | null;
  roles: string[];
  specialty: string | null;
  imageFile: string | null;
  // Base stats
  hp: number | null;
  hpGrowth: number | null;
  mana: number | null;
  manaGrowth: number | null;
  physAtk: number | null;
  physAtkGrowth: number | null;
  magAtk: number | null;
  magAtkGrowth: number | null;
  armor: number | null;
  armorGrowth: number | null;
  magRes: number | null;
  magResGrowth: number | null;
  moveSpeed: number | null;
  attackSpeed: number | null;
  attackSpdGrowth: number | null;
  hpRegen: number | null;
  manaRegen: number | null;
}

export function parseHeroInfobox(wikitext: string, pageTitle: string): RawHeroData {
  const rolesRaw = extractParam(wikitext, "role") ?? "";
  const roles = rolesRaw
    .split(/[,/]/)
    .map((r) => r.replace(/\[\[|\]\]/g, "").trim())
    .filter(Boolean);

  // The hero's portrait is typically "{{PAGENAME}}avatar.png" or extracted from
  // the infobox |image= parameter.
  const imageParam = extractParam(wikitext, "image");
  const imageFile = imageParam
    ? imageParam.replace(/\[\[File:|\]\]/gi, "").split("|")[0].trim()
    : `${pageTitle.replace(/\s+/g, "_")}_avatar.png`;

  return {
    name: pageTitle,
    title: extractParam(wikitext, "title"),
    roles,
    specialty: extractParam(wikitext, "specialty"),
    imageFile,
    hp: extractNumber(wikitext, "hp"),
    hpGrowth: extractNumber(wikitext, "hpgrowth") ?? extractNumber(wikitext, "hp_growth"),
    mana: extractNumber(wikitext, "mana"),
    manaGrowth: extractNumber(wikitext, "managrowth") ?? extractNumber(wikitext, "mana_growth"),
    physAtk: extractNumber(wikitext, "attack"),
    physAtkGrowth: extractNumber(wikitext, "attackgrowth") ?? extractNumber(wikitext, "attack_growth"),
    magAtk: extractNumber(wikitext, "magic_power") ?? null,
    magAtkGrowth: null,
    armor: extractNumber(wikitext, "armor"),
    armorGrowth: extractNumber(wikitext, "armorgrowth") ?? extractNumber(wikitext, "armor_growth"),
    magRes: extractNumber(wikitext, "magic_resistance") ?? extractNumber(wikitext, "magicresistance"),
    magResGrowth: extractNumber(wikitext, "magic_resistance_growth") ?? null,
    moveSpeed: extractNumber(wikitext, "movespeed") ?? extractNumber(wikitext, "speed"),
    attackSpeed: extractNumber(wikitext, "attack_speed") ?? extractNumber(wikitext, "attackspeed"),
    attackSpdGrowth: null,
    hpRegen: extractNumber(wikitext, "hp_regen") ?? extractNumber(wikitext, "hpregen"),
    manaRegen: extractNumber(wikitext, "mana_regen") ?? extractNumber(wikitext, "manaregen"),
  };
}

// ---------------------------------------------------------------------------
// Item infobox parser
// ---------------------------------------------------------------------------

export interface RawItemData {
  name: string;
  imageFile: string | null;
  category: string | null;
  tier: number;
  goldCost: number | null;
  hp: number | null;
  mana: number | null;
  physAtk: number | null;
  magPower: number | null;
  physDef: number | null;
  magDef: number | null;
  physPenFlat: number | null;
  physPenPct: number | null;
  magPenFlat: number | null;
  magPenPct: number | null;
  critRate: number | null;
  critDamage: number | null;
  attackSpeed: number | null;
  lifeSteal: number | null;
  spellVamp: number | null;
  cdr: number | null;
  moveSpeed: number | null;
  hpRegen: number | null;
  manaRegen: number | null;
  passiveName: string | null;
  passiveDesc: string | null;
  components: string[]; // names of component items
}

export function parseItemInfobox(wikitext: string, pageTitle: string): RawItemData {
  const imageParam = extractParam(wikitext, "image");
  const imageFile = imageParam
    ? imageParam.replace(/\[\[File:|\]\]/gi, "").split("|")[0].trim()
    : `${pageTitle.replace(/\s+/g, "_")}.png`;

  // Components: listed as |component1=, |component2=, |component3=
  const components: string[] = [];
  for (let i = 1; i <= 4; i++) {
    const c = extractParam(wikitext, `component${i}`);
    if (c) components.push(c.replace(/\[\[|\]\]/g, "").trim());
  }

  const tierRaw = extractParam(wikitext, "tier");
  const tier = tierRaw ? parseInt(tierRaw) : components.length === 0 ? 3 : 1;

  // Handle percentage values like "10%" → 0.10
  const pctParam = (key: string) => {
    const raw = extractParam(wikitext, key);
    if (!raw) return null;
    const clean = raw.replace(/[^\d.]/g, "");
    const num = parseFloat(clean);
    return isNaN(num) ? null : num / 100;
  };

  return {
    name: pageTitle,
    imageFile,
    category: extractParam(wikitext, "category"),
    tier,
    goldCost: extractNumber(wikitext, "buy") ?? extractNumber(wikitext, "cost"),
    hp: extractNumber(wikitext, "hp"),
    mana: extractNumber(wikitext, "mana"),
    physAtk: extractNumber(wikitext, "attack") ?? extractNumber(wikitext, "physical_attack"),
    magPower: extractNumber(wikitext, "magic_power"),
    physDef: extractNumber(wikitext, "armor") ?? extractNumber(wikitext, "physical_defense"),
    magDef: extractNumber(wikitext, "magic_resistance") ?? extractNumber(wikitext, "magic_defense"),
    physPenFlat: extractNumber(wikitext, "physical_penetration_flat") ?? extractNumber(wikitext, "pen_flat"),
    physPenPct: pctParam("physical_penetration") ?? pctParam("pen_pct"),
    magPenFlat: extractNumber(wikitext, "magic_penetration_flat"),
    magPenPct: pctParam("magic_penetration"),
    critRate: pctParam("crit_rate") ?? pctParam("critical_chance"),
    critDamage: pctParam("crit_damage") ?? pctParam("critical_damage"),
    attackSpeed: pctParam("attack_speed"),
    lifeSteal: pctParam("life_steal") ?? pctParam("lifesteal"),
    spellVamp: pctParam("spell_vamp"),
    cdr: pctParam("cooldown_reduction") ?? pctParam("cdr"),
    moveSpeed: extractNumber(wikitext, "movement_speed") ?? extractNumber(wikitext, "move_speed"),
    hpRegen: extractNumber(wikitext, "hp_regen"),
    manaRegen: extractNumber(wikitext, "mana_regen"),
    passiveName: extractParam(wikitext, "passive"),
    passiveDesc: extractParam(wikitext, "passive_description") ?? extractParam(wikitext, "unique"),
    components,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
