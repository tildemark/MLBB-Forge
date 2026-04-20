/**
 * lib/calc.ts
 * Core MLBB stat math engine.
 * All functions are pure — no side effects, no DB calls.
 */

export interface HeroBaseStats {
  baseHp: number;
  hpGrowth: number;
  baseMana: number;
  manaGrowth: number;
  baseAtkPhys: number;
  atkPhysGrowth: number;
  baseAtkMag: number;
  atkMagGrowth: number;
  baseArmor: number;
  armorGrowth: number;
  baseMagRes: number;
  magResGrowth: number;
  baseMoveSpeed: number;
  baseAttackSpd: number;
  atkSpdGrowth: number;
  baseHpRegen: number;
  baseManaRegen: number;
}

export interface ItemStats {
  hp?: number;
  mana?: number;
  physAtk?: number;
  magPower?: number;
  armor?: number;
  magRes?: number;
  moveSpeed?: number;
  moveSpeedPct?: number;  // 0–100 percentage
  atkSpd?: number;        // 0–100 percentage bonus (e.g. 10 = +10% attack speed)
  critRate?: number;      // 0–100 percentage (e.g. 25 = 25% crit)
  critDmg?: number;       // 0–100 percentage (e.g. 40 = +40% crit dmg bonus)
  physPen?: number;
  magPen?: number;
  physPenPct?: number;    // 0–100 percentage
  magPenPct?: number;     // 0–100 percentage
  lifesteal?: number;     // 0–100 percentage
  magLifesteal?: number;  // 0–100 percentage
  hpRegen?: number;
  cd?: number;            // 0–100 percentage (e.g. 10 = 10% CDR)
  hybridPen?: number;
  adaptiveAtk?: number;
}

export interface FinalStats {
  hp: number;
  mana: number;
  physAtk: number;
  magPower: number;
  armor: number;
  magRes: number;
  moveSpeed: number;
  atkSpd: number;         // capped
  atkSpdCap: number;       // effective cap (3.00 normally, 5.00 with Golden Staff)
  atkSpdWasted: number;    // raw speed above cap
  critRate: number;   // 0–1
  critDmg: number;    // multiplier e.g. 1.75
  physPen: number;    // flat
  magPen: number;     // flat
  physPenPct: number; // 0–1
  magPenPct: number;  // 0–1
  lifesteal: number;  // 0–1
  magLifesteal: number;
  hpRegen: number;
  cd: number;         // 0–1, hard-capped at cdrCap
  cdrCap: number;     // the effective CDR cap (0.40 or 0.45 with Enchanted Talisman)
  cdWasted: number;   // any % over the cap
  critRateWasted: number; // any % over 100% crit cap
  lifestealWasted: number;    // any % over 40% lifesteal cap
  magLifestealWasted: number; // any % over 40% spell vamp cap
  eHP: number;
  effectivePhysAtk: number; // for display in stat sheet
  goldenStaffAtkSpdBonus: number; // crit% converted to atk spd by Golden Staff (0 if not equipped)
  bloodWingsShield: number;       // Guard shield value from Blood Wings (0 if not equipped)
  holyXtalBoost: number;          // % Magic Power boost from Holy Crystal (0 if not equipped, else 21-35)
}

/** Stat value at a given level using the linear growth model */
export function statAtLevel(base: number, growth: number, level: number): number {
  return Math.round((base + growth * (level - 1)) * 100) / 100;
}

const CDR_CAP_DEFAULT = 0.40;

/**
 * Compute final stats from hero base stats at a given level
 * plus an array of item stat contributions.
 */
export function computeStats(
  hero: HeroBaseStats,
  level: number,
  items: ItemStats[],
  options?: { cdrCap?: number; atkSpdCap?: number }
): FinalStats {
  const CDR_CAP = options?.cdrCap ?? CDR_CAP_DEFAULT;
  const ATK_SPD_CAP = options?.atkSpdCap ?? 3.00;
  // Sum all item contributions
  const sum = (key: keyof ItemStats): number =>
    items.reduce((acc, it) => acc + (it[key] ?? 0), 0);

  const hp       = statAtLevel(hero.baseHp,      hero.hpGrowth,       level) + sum("hp");
  const mana     = statAtLevel(hero.baseMana,     hero.manaGrowth,     level) + sum("mana");
  const physAtk  = statAtLevel(hero.baseAtkPhys,  hero.atkPhysGrowth,  level) + sum("physAtk") + sum("adaptiveAtk");
  const magPower = statAtLevel(hero.baseAtkMag,   hero.atkMagGrowth,   level) + sum("magPower");
  const armor    = statAtLevel(hero.baseArmor,    hero.armorGrowth,    level) + sum("armor");
  const magRes   = statAtLevel(hero.baseMagRes,   hero.magResGrowth,   level) + sum("magRes");

  // Move speed: flat + % applied to base (not additive with flat)
  const msBase = hero.baseMoveSpeed + sum("moveSpeed");
  const moveSpeed = Math.round(msBase * (1 + sum("moveSpeedPct") / 100));

  // Attack speed: base * (1 + total % bonus); items give % bonus stored as 0–100
  const rawAtkSpd = Math.max(
    0.1,
    statAtLevel(hero.baseAttackSpd, hero.atkSpdGrowth, level) * (1 + sum("atkSpd") / 100)
  );
  const atkSpd = Math.min(ATK_SPD_CAP, rawAtkSpd);
  const atkSpdWasted = Math.max(0, rawAtkSpd - ATK_SPD_CAP);

  // Crit
  const critRate = Math.min(1, sum("critRate") / 100);
  const critRateWasted = Math.max(0, sum("critRate") / 100 - 1);
  const critDmg  = 1 + (sum("critDmg") || 0) / 100 + (critRate > 0 ? 0.25 : 0); // base 25% crit bonus

  // CDR — hard cap 40%
  const rawCd = sum("cd") / 100;
  const cd = Math.min(CDR_CAP, rawCd);
  const cdWasted = Math.max(0, rawCd - CDR_CAP);

  // Penetration
  const physPen    = sum("physPen") + sum("hybridPen");
  const magPen     = sum("magPen")  + sum("hybridPen");
  const physPenPct = Math.min(1, sum("physPenPct") / 100);
  const magPenPct  = Math.min(1, sum("magPenPct")  / 100);

  const lifesteal    = Math.min(0.40, sum("lifesteal") / 100);
  const lifestealWasted = Math.max(0, sum("lifesteal") / 100 - 0.40);
  const magLifesteal = Math.min(0.40, sum("magLifesteal") / 100);
  const magLifestealWasted = Math.max(0, sum("magLifesteal") / 100 - 0.40);
  const hpRegen = statAtLevel(hero.baseHpRegen, 0, level) + sum("hpRegen");

  // eHP: HP / (1 - DR) where DR = armor / (120 + armor)
  const physDR = armor / (120 + armor);
  const eHP    = Math.round(hp / (1 - physDR));

  // For display — effective phys atk factors in crit
  const effectivePhysAtk = Math.round(physAtk * (1 + critRate * (critDmg - 1)));

  return {
    hp, mana, physAtk, magPower, armor, magRes,
    moveSpeed, atkSpd, critRate, critDmg,
    physPen, magPen, physPenPct, magPenPct,
    lifesteal, magLifesteal, hpRegen,
    cd, cdWasted, cdrCap: CDR_CAP, atkSpdCap: ATK_SPD_CAP, atkSpdWasted,
    critRateWasted, lifestealWasted, magLifestealWasted, eHP, effectivePhysAtk,
    goldenStaffAtkSpdBonus: 0,
    bloodWingsShield: 0,
    holyXtalBoost: 0,
  };
}

/** Damage dealt to a target with given armor, factoring flat + % pen (applied in order) */
export function calcDamageDealt(
  rawDmg: number,
  targetArmor: number,
  flatPen: number,
  pctPen: number
): number {
  const afterFlat = Math.max(0, targetArmor - flatPen);
  const afterPct  = afterFlat * (1 - pctPen);
  const dr = afterPct / (120 + afterPct);
  return Math.round(rawDmg * (1 - dr));
}

// ---------------------------------------------------------------------------
// Skill damage engine
// ---------------------------------------------------------------------------

export interface SkillDamageResult {
  rawPhys: number;
  rawMag: number;
  dealtPhys: number;
  dealtMag: number;
  total: number;
  cooldown: number | null; // effective after CDR
  manaCost: number | null;
}

/**
 * Compute skill damage at the player's current stats vs a configurable target.
 * - Pure physical skills: base + physScaling * physAtk → apply phys pen
 * - Pure magical skills:  base + magScaling * magPower → apply mag pen
 * - Hybrid skills (both scalings set): phys component + magic component summed
 * - No scaling (base only): treated as physical
 */
export function calcSkillDamage(
  s: {
    baseDamage: number | null;
    physScaling: number | null;
    magScaling: number | null;
    cooldown: number | null;
    manaCost: number | null;
  },
  stats: FinalStats,
  targetArmor = 80,
  targetMagRes = 50,
): SkillDamageResult {
  const base    = s.baseDamage ?? 0;
  const hasPhys = (s.physScaling ?? 0) > 0;
  const hasMag  = (s.magScaling  ?? 0) > 0;

  let rawPhys = 0;
  let rawMag  = 0;

  if (hasPhys && hasMag) {
    // Hybrid: base damage goes to the magic component
    rawPhys = Math.round(s.physScaling! * stats.physAtk);
    rawMag  = Math.round(base + s.magScaling! * stats.magPower);
  } else if (hasPhys) {
    rawPhys = Math.round(base + s.physScaling! * stats.physAtk);
  } else if (hasMag) {
    rawMag  = Math.round(base + s.magScaling! * stats.magPower);
  } else {
    // Pure base — treat as physical (e.g. true damage placeholder)
    rawPhys = Math.round(base);
  }

  const dealtPhys = rawPhys > 0
    ? calcDamageDealt(rawPhys, targetArmor, stats.physPen, stats.physPenPct)
    : 0;
  const dealtMag = rawMag > 0
    ? calcDamageDealt(rawMag, targetMagRes, stats.magPen, stats.magPenPct)
    : 0;

  const cooldown = s.cooldown != null
    ? Math.round(s.cooldown * (1 - stats.cd) * 10) / 10
    : null;

  return {
    rawPhys, rawMag,
    dealtPhys, dealtMag,
    total: dealtPhys + dealtMag,
    cooldown,
    manaCost: s.manaCost,
  };
}
