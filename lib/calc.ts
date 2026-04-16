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
  moveSpeedPct?: number;
  atkSpd?: number;
  critRate?: number;
  critDmg?: number;
  physPen?: number;
  magPen?: number;
  physPenPct?: number;
  magPenPct?: number;
  lifesteal?: number;
  magLifesteal?: number;
  hpRegen?: number;
  cd?: number; // cooldown reduction %
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
  atkSpd: number;
  critRate: number;   // 0–1
  critDmg: number;    // multiplier e.g. 1.75
  physPen: number;    // flat
  magPen: number;     // flat
  physPenPct: number; // 0–1
  magPenPct: number;  // 0–1
  lifesteal: number;  // 0–1
  magLifesteal: number;
  hpRegen: number;
  cd: number;         // 0–1, hard-capped at 0.40
  cdWasted: number;   // any % over the cap
  eHP: number;
  effectivePhysAtk: number; // for display in stat sheet
}

/** Stat value at a given level using the linear growth model */
export function statAtLevel(base: number, growth: number, level: number): number {
  return Math.round((base + growth * (level - 1)) * 100) / 100;
}

const CDR_CAP = 0.40;

/**
 * Compute final stats from hero base stats at a given level
 * plus an array of item stat contributions.
 */
export function computeStats(
  hero: HeroBaseStats,
  level: number,
  items: ItemStats[]
): FinalStats {
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

  // Attack speed: base + flat bonus; game shows as value like 1.05 attacks/s
  const atkSpd = Math.max(
    0.1,
    statAtLevel(hero.baseAttackSpd, hero.atkSpdGrowth, level) + sum("atkSpd")
  );

  // Crit
  const critRate = Math.min(1, sum("critRate") / 100);
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
  const magLifesteal = Math.min(0.40, sum("magLifesteal") / 100);
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
    cd, cdWasted, eHP, effectivePhysAtk,
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
