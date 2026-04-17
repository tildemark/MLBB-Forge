/**
 * scripts/lib/lua-parser.ts
 *
 * Parses the Lua table format used by the MLBB wiki data modules.
 * e.g. Module:Equipment/data and Module:Hero/data
 *
 * We use simple regex-based extraction rather than a full Lua interpreter.
 */

// ---------------------------------------------------------------------------
// Equipment / Item parser
// ---------------------------------------------------------------------------

export interface LuaItemRecord {
  name: string;
  caption: string | null;
  bonus: string | null;       // "+160 Physical Attack, +5% Movement Speed"
  unique: string | null;      // "+40% Crit Damage" or empty
  passive: string | null;     // "Doom: ..."
  active: string | null;
  price: number | null;
  upgradePrice: number | null;
  type: string | null;        // "Attack", "Magic", "Defense", etc.
  recipe: string[];           // component item names
  availability: string | null;
}

export interface LuaHeroRecord {
  name: string;
  title: string | null;
  role1: string | null;
  role2: string | null;
  specialty1: string | null;
  resource: string | null;    // "Mana" | "Energy" | "HP" | "None"
  dmgType: string | null;      // "Physical" | "Magic"
  atkType: string | null;      // "Melee" | "Ranged"
  lane1: string | null;
  lane2: string | null;
  specialty2: string | null;
  hp1: number | null;
  hp15: number | null;
  hpRegen1: number | null;
  hpRegen15: number | null;
  mana1: number | null;
  mana15: number | null;
  manaRegen1: number | null;
  manaRegen15: number | null;
  physAtk1: number | null;
  physAtk15: number | null;
  physDef1: number | null;
  physDef15: number | null;
  magDef1: number | null;
  magDef15: number | null;
  atkSpd1: number | null;
  atkSpd15: number | null;
  movementSpd: number | null;
}

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

/** Extract a string field from a Lua record block */
function strField(block: string, key: string): string | null {
  const re = new RegExp(`\\["${key}"\\]\\s*=\\s*"([^"]*)"`, "i");
  const m = block.match(re);
  return m ? m[1].trim() : null;
}

/** Extract a numeric field */
function numField(block: string, key: string): number | null {
  const raw = strField(block, key);
  if (!raw) return null;
  const n = parseFloat(raw.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// Split top-level Lua records
// We split on the pattern:  \["SomeName"\] = {
// ---------------------------------------------------------------------------
function splitLuaRecords(lua: string): Map<string, string> {
  const map = new Map<string, string>();
  // Match each top-level key and capture its block until the matching closing }
  const keyRe = /\["([^\]]+)"\]\s*=\s*\{/g;
  const indices: { name: string; start: number }[] = [];
  let m: RegExpExecArray | null;

  while ((m = keyRe.exec(lua)) !== null) {
    indices.push({ name: m[1], start: m.index });
  }

  for (let i = 0; i < indices.length; i++) {
    const start = indices[i].start;
    const end = indices[i + 1]?.start ?? lua.length;
    map.set(indices[i].name, lua.slice(start, end));
  }

  return map;
}

// ---------------------------------------------------------------------------
// Equipment parser
// ---------------------------------------------------------------------------

export function parseEquipmentModule(lua: string): LuaItemRecord[] {
  const records = splitLuaRecords(lua);
  const items: LuaItemRecord[] = [];

  for (const [name, block] of records) {
    // Skip placeholder/template entries
    if (name === "Boots" && block.includes("<")) continue;

    const recipeRaw = strField(block, "recipe") ?? "";
    const recipe = recipeRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    items.push({
      name,
      caption: strField(block, "caption"),
      bonus: strField(block, "bonus"),
      unique: strField(block, "unique"),
      passive: strField(block, "passive"),
      active: strField(block, "active"),
      price: numField(block, "price"),
      upgradePrice: numField(block, "upgrade_price"),
      type: strField(block, "type"),
      recipe,
      availability: strField(block, "availability"),
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Hero parser
// ---------------------------------------------------------------------------

/** Extract a full brace-matched block starting at position `openPos` in `src` */
function extractBraceBlock(src: string, openPos: number): string {
  let depth = 1;
  let pos = openPos + 1;
  while (depth > 0 && pos < src.length) {
    if (src[pos] === "{") depth++;
    else if (src[pos] === "}") depth--;
    pos++;
  }
  return src.slice(openPos, pos);
}

export function parseHeroModule(lua: string): LuaHeroRecord[] {
  const heroes: LuaHeroRecord[] = [];

  // Match top-level hero entries: lines starting with \t["Name"] = {
  // Using brace-counting so nested sub-tables (like ["stats"]) are included.
  const keyRe = /\n\t\["([^\]]+)"\]\s*=\s*\{/g;
  let m: RegExpExecArray | null;

  while ((m = keyRe.exec(lua)) !== null) {
    const name = m[1];
    const openPos = m.index + m[0].length - 1; // position of opening {
    const block = extractBraceBlock(lua, openPos);

    // Skip the placeholder template entry
    if (strField(block, "id") === "000" || strField(block, "id") === "<id>") continue;
    // Skip non-hero entries (e.g. "stats" template key itself)
    if (!strField(block, "role1") && !strField(block, "name")) continue;

    // Locate the nested ["stats"] sub-block within the full block
    const statsKeyIdx = block.indexOf('["stats"]');
    let statsBlock = "";
    if (statsKeyIdx >= 0) {
      const statsOpenIdx = block.indexOf("{", statsKeyIdx);
      if (statsOpenIdx >= 0) {
        statsBlock = extractBraceBlock(block, statsOpenIdx);
      }
    }

    const statsStr = (key: string): string | null => {
      const re = new RegExp(`\\["${key}"\\]\\s*=\\s*"([^"]*)"`, "i");
      const m = statsBlock.match(re);
      return m ? m[1].trim() : null;
    };

    const statsNum = (key: string): number | null => {
      const raw = statsStr(key);
      if (!raw) return null;
      const n = parseFloat(raw.replace(/[^0-9.]/g, ""));
      return isNaN(n) ? null : n;
    };

    heroes.push({
      name,
      title: strField(block, "title"),
      role1: strField(block, "role1"),
      role2: strField(block, "role2"),
      specialty1: strField(block, "specialty1"),
      specialty2: strField(block, "specialty2"),
      lane1: strField(block, "lane1"),
      lane2: strField(block, "lane2"),
      resource: strField(block, "resource"),
      dmgType: strField(block, "dmg_type"),
      atkType: strField(block, "atk_type"),
      hp1: statsNum("hp1"),
      hp15: statsNum("hp15"),
      hpRegen1: statsNum("hp_regen1"),
      hpRegen15: statsNum("hp_regen15"),
      mana1: statsNum("mana1"),
      mana15: statsNum("mana15"),
      manaRegen1: statsNum("mana_regen1"),
      manaRegen15: statsNum("mana_regen15"),
      physAtk1: statsNum("physical_atk1"),
      physAtk15: statsNum("physical_atk15"),
      physDef1: statsNum("physical_def1"),
      physDef15: statsNum("physical_def15"),
      magDef1: statsNum("magic_def1"),
      magDef15: statsNum("magic_def15"),
      atkSpd1: statsNum("atk_spd1"),
      atkSpd15: statsNum("atk_spd15"),
      movementSpd: statsNum("movement_spd"),
    });
  }

  return heroes;
}

// ---------------------------------------------------------------------------
// Bonus string parser — "+160 Physical Attack, +5% Movement Speed"
// ---------------------------------------------------------------------------

export interface ParsedBonuses {
  hp: number;
  mana: number;
  physAtk: number;
  magPower: number;
  physDef: number;
  magDef: number;
  physPenFlat: number;
  physPenPct: number;
  magPenFlat: number;
  magPenPct: number;
  critRate: number;
  critDamage: number;
  attackSpeed: number;
  lifeSteal: number;
  spellVamp: number;
  cdr: number;
  moveSpeed: number;
  hpRegen: number;
  manaRegen: number;
}

const EMPTY_BONUSES: ParsedBonuses = {
  hp: 0, mana: 0, physAtk: 0, magPower: 0, physDef: 0, magDef: 0,
  physPenFlat: 0, physPenPct: 0, magPenFlat: 0, magPenPct: 0,
  critRate: 0, critDamage: 0, attackSpeed: 0, lifeSteal: 0,
  spellVamp: 0, cdr: 0, moveSpeed: 0, hpRegen: 0, manaRegen: 0,
};

type StatKey = keyof ParsedBonuses;

/** Map keyword fragments → stat keys. Order matters for substring matching. */
const STAT_MAP: [RegExp, StatKey, boolean][] = [
  // [pattern, statKey, isPercent]
  [/physical\s+pen/i,      "physPenFlat",  false],
  [/magic\s+pen/i,         "magPenFlat",   false],
  [/crit\s+chance/i,       "critRate",     true],
  [/crit\s+damage/i,       "critDamage",   true],
  [/cooldown\s+red/i,      "cdr",          true],
  [/physical\s+attack/i,   "physAtk",      false],
  [/magic\s+power/i,       "magPower",     false],
  [/physical\s+def/i,      "physDef",      false],
  [/magic\s+def/i,         "magDef",       false],
  [/attack\s+speed/i,      "attackSpeed",  true],
  [/movement\s+speed/i,    "moveSpeed",    false],
  [/life\s*steal/i,        "lifeSteal",    true],
  [/spell\s*vamp/i,        "spellVamp",    true],
  [/hp\s+regen/i,          "hpRegen",      false],
  [/mana\s+regen/i,        "manaRegen",    false],
  [/\bhp\b/i,              "hp",           false],
  [/\bmana\b/i,            "mana",         false],
];

export function parseBonusString(
  bonus: string | null,
  unique: string | null
): ParsedBonuses {
  const result = { ...EMPTY_BONUSES };
  const combined = [bonus ?? "", unique ?? ""].join(", ");

  for (const part of combined.split(",")) {
    const numMatch = part.match(/\+?(\d+(?:\.\d+)?)\s*(%?)/);
    if (!numMatch) continue;

    const value = parseFloat(numMatch[1]);
    const isPct = numMatch[2] === "%";

    for (const [pattern, statKey, expectsPct] of STAT_MAP) {
      if (pattern.test(part)) {
        result[statKey] = expectsPct
          ? (isPct ? value / 100 : value)
          : value;
        break;
      }
    }
  }

  return result;
}
