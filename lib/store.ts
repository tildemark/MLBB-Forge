"use client";

/**
 * lib/store.ts
 * Zustand store for the forge sandbox.
 * Holds the currently selected hero, level, items, emblem, spell,
 * and computes derived stats on every change.
 */

import { create } from "zustand";
import { computeStats, type HeroBaseStats, type ItemStats, type FinalStats } from "./calc";
import { parseStatEffects } from "./stat-parser";
import type { SkillData, BuildSuggestion } from "./actions";

// Minimal shapes for data loaded from DB (matches Prisma output)
export interface HeroOption {
  id: string;
  slug: string;
  name: string;
  title: string;
  imageFile: string;
  role: string[];
  specialty: string | null;
  lane: string | null;
  resource: string | null;
  dmgType: string | null;
  atkType: string | null;
}

/** HeroStatsRecord is the same shape as HeroBaseStats from calc.ts */
export type HeroStatsRecord = HeroBaseStats;

export interface ItemOption {
  slug: string;
  name: string;
  imageFile: string;
  category: string;
  tier: number;
  goldCost: number;
  passiveName: string | null;
  passiveDesc: string | null;
  stats: ItemStats;
}

export interface EmblemOption {
  slug: string;
  name: string;
  imageFile: string;
  attrs: { name: string; value: number }[];
  nodes: EmblemNode[];
}

export interface EmblemNode {
  id: string;
  tier: number;
  position: number;
  name: string;
  description: string;
  statKey: string | null;
  statValue: number | null;
  imageFile: string;
}

export interface SpellOption {
  slug: string;
  name: string;
  imageFile: string;
  description: string;
}

/** The player's active talent selections for a chosen emblem set */
export interface TalentSelection {
  /** One talent chosen from tier 1 (standard row 1) */
  standard1: EmblemNode | null;
  /** One talent chosen from tier 2 (standard row 2) */
  standard2: EmblemNode | null;
  /** One core talent chosen from tier 3 */
  core: EmblemNode | null;
}

const MAX_ITEMS = 6;
const EMPTY_STATS: FinalStats = {
  hp: 0, mana: 0, physAtk: 0, magPower: 0,
  armor: 0, magRes: 0, moveSpeed: 0, atkSpd: 0,
  atkSpdCap: 3.0, atkSpdWasted: 0,
  critRate: 0, critDmg: 1, critRateWasted: 0,
  physPen: 0, magPen: 0,
  physPenPct: 0, magPenPct: 0,
  lifesteal: 0, lifestealWasted: 0,
  magLifesteal: 0, magLifestealWasted: 0,
  hpRegen: 0, cd: 0, cdrCap: 0.4, cdWasted: 0,
  eHP: 0, effectivePhysAtk: 0,
  goldenStaffAtkSpdBonus: 0,
  bloodWingsShield: 0,
  holyXtalBoost: 0,
};

interface ForgeState {
  // Selections
  hero: HeroOption | null;
  heroStats: HeroStatsRecord | null;
  level: number;
  items: (ItemOption | null)[];
  emblem: EmblemOption | null;
  talents: TalentSelection;
  spell: SpellOption | null;
  loadedSkills: SkillData[];
  activeSkillIds: string[];
  loadedBuilds: BuildSuggestion[];
  itemConditions: {
    bodActive: boolean;      // Blade of Despair: target < 50% HP
    warAxeStacks: number;    // 0–6 stacks
  };

  // Derived
  finalStats: FinalStats;

  // Actions
  setHero: (hero: HeroOption, stats: HeroStatsRecord) => void;
  setLevel: (level: number) => void;
  setItem: (slot: number, item: ItemOption | null) => void;
  moveItem: (from: number, to: number) => void;
  setEmblem: (emblem: EmblemOption | null) => void;
  setTalent: (slot: "standard1" | "standard2" | "core", node: EmblemNode | null) => void;
  setSpell: (spell: SpellOption | null) => void;
  setLoadedSkills: (skills: SkillData[]) => void;
  toggleSkill: (id: string) => void;
  setLoadedBuilds: (builds: BuildSuggestion[]) => void;
  applyBuild: (build: BuildSuggestion) => void;
  setItemCondition: <K extends keyof ForgeState["itemConditions"]>(key: K, value: ForgeState["itemConditions"][K]) => void;
}

const EMPTY_TALENTS: TalentSelection = { standard1: null, standard2: null, core: null };

/** Map emblem base attribute names to ItemStats keys */
export const EMBLEM_ATTR_MAP: Record<string, keyof import("./calc").ItemStats> = {
  "hp":                 "hp",
  "physical atk":       "physAtk",
  "magic power":        "magPower",
  "physical def":       "armor",
  "magic def":          "magRes",
  "movement speed":     "moveSpeed",
  "mana":               "mana",
  "cooldown reduction": "cd",
  "cd reduction":       "cd",
  "physical pen":       "physPen",
  "magic pen":          "magPen",
  "crit rate":          "critRate",
  "crit damage":        "critDmg",
  "adaptive attack":    "adaptiveAtk",
  "hybrid pen":         "hybridPen",
};

function derive(
  state: Pick<ForgeState, "heroStats" | "level" | "items" | "emblem" | "talents" | "spell" | "loadedSkills" | "activeSkillIds" | "itemConditions">
): FinalStats {
  if (!state.heroStats) return EMPTY_STATS;
  const itemStats: ItemStats[] = state.items
    .filter((i): i is ItemOption => i !== null)
    .map((i) => i.stats);

  // Emblem base attributes
  if (state.emblem?.attrs?.length) {
    const emblemBonus: ItemStats = {};
    for (const attr of state.emblem.attrs) {
      const statKey = EMBLEM_ATTR_MAP[attr.name.toLowerCase()];
      if (statKey) {
        (emblemBonus as Record<string, number>)[statKey] =
          ((emblemBonus as Record<string, number>)[statKey] ?? 0) + attr.value;
      }
    }
    itemStats.push(emblemBonus);
  }

  // Active emblem talent stat effects (parsed from description)
  for (const node of [state.talents.standard1, state.talents.standard2, state.talents.core]) {
    if (!node) continue;
    // Prefer DB-stored statKey/statValue; fall back to parsing
    if (node.statKey && node.statValue != null) {
      const mapped = EMBLEM_ATTR_MAP[node.statKey.toLowerCase()] ?? node.statKey;
      itemStats.push({ [mapped]: node.statValue } as ItemStats);
    } else if (node.description) {
      const parsed = parseStatEffects(node.description);
      if (Object.keys(parsed).length) itemStats.push(parsed);
    }
  }

  // Selected battle spell stat effects (parsed from description)
  if (state.spell?.description) {
    const parsed = parseStatEffects(state.spell.description);
    if (Object.keys(parsed).length) itemStats.push(parsed);
  }

  // Active skill stat effects (toggleable by the user)
  for (const skillId of state.activeSkillIds) {
    const skill = state.loadedSkills.find((s) => s.id === skillId);
    if (skill?.description) {
      const parsed = parseStatEffects(skill.description);
      if (Object.keys(parsed).length) itemStats.push(parsed);
    }
  }

  // Enchanted Talisman raises CDR cap to 45%
  const hasTalisman    = state.items.some((i) => i?.slug === "enchanted-talisman");
  // Golden Staff: raises atk spd cap to 5.00/s AND converts all crit rate → attack speed bonus
  const hasGoldenStaff = state.items.some((i) => i?.slug === "golden-staff");
  // War Axe: Fighting Spirit stacks add +12 Phys ATK per stack (0–6)
  const hasWarAxe = state.items.some((i) => i?.slug === "war-axe");
  if (hasWarAxe && state.itemConditions.warAxeStacks > 0) {
    itemStats.push({ physAtk: 12 * state.itemConditions.warAxeStacks });
  }

  let goldenStaffBonus = 0;
  if (hasGoldenStaff) {
    const totalCritRate = itemStats.reduce((acc, s) => acc + (s.critRate ?? 0), 0);
    if (totalCritRate > 0) {
      goldenStaffBonus = totalCritRate;
      // Cancel out all crit rate and re-add as attack speed bonus
      itemStats.push({ atkSpd: totalCritRate, critRate: -totalCritRate });
    }
  }

  const result = computeStats(state.heroStats, state.level, itemStats, {
    cdrCap: hasTalisman ? 0.45 : 0.40,
    atkSpdCap: hasGoldenStaff ? 5.00 : 3.00,
  });
  result.goldenStaffAtkSpdBonus = goldenStaffBonus;

  // Holy Crystal — Mystery: +21% Magic Power at lv1, scaling to +35% at lv15
  const hasHolyCrystal = state.items.some((i) => i?.slug === "holy-crystal");
  const holyXtalBoost = hasHolyCrystal ? 21 + (state.level - 1) : 0; // 21% lv1 → 35% lv15
  if (hasHolyCrystal) {
    result.magPower = Math.round(result.magPower * (1 + holyXtalBoost / 100));
  }
  result.holyXtalBoost = holyXtalBoost;

  // Blood Wings — Guard shield: 800 + 1 × Total Magic Power (after Holy Crystal boost)
  const hasBloodWings = state.items.some((i) => i?.slug === "blood-wings");
  result.bloodWingsShield = hasBloodWings ? Math.round(800 + result.magPower) : 0;

  // Blade of Despair — Despair: +25% Physical Attack when target < 50% HP
  const hasBoD = state.items.some((i) => i?.slug === "blade-of-despair");
  if (hasBoD && state.itemConditions.bodActive) {
    result.physAtk = Math.round(result.physAtk * 1.25);
    result.effectivePhysAtk = Math.round(result.physAtk * (1 + result.critRate * (result.critDmg - 1)));
  }

  return result;
}

export const useForgeStore = create<ForgeState>((set, get) => ({
  hero: null,
  heroStats: null,
  level: 1,
  items: Array(MAX_ITEMS).fill(null),
  emblem: null,
  talents: EMPTY_TALENTS,
  spell: null,
  loadedSkills: [],
  activeSkillIds: [],
  loadedBuilds: [],
  itemConditions: { bodActive: false, warAxeStacks: 0 },
  finalStats: EMPTY_STATS,

  setHero(hero, heroStats) {
    const s = get();
    const level = s.level;
    const items = s.items;
    const emblem = s.emblem;
    const talents = s.talents;
    const spell = s.spell;
    const itemConditions = s.itemConditions;
    const loadedSkills: SkillData[] = [];
    const activeSkillIds: string[] = [];
    const finalStats = derive({ heroStats, level, items, emblem, talents, spell, loadedSkills, activeSkillIds, itemConditions });
    set({ hero, heroStats, loadedSkills, activeSkillIds, loadedBuilds: [], finalStats });
  },

  setLevel(level) {
    const s = get();
    const finalStats = derive({ ...s, level });
    set({ level, finalStats });
  },

  setItem(slot, item) {
    const items = [...get().items];
    items[slot] = item;
    const finalStats = derive({ ...get(), items });
    set({ items, finalStats });
  },

  moveItem(from, to) {
    if (from === to) return;
    const items = [...get().items];
    // Swap the two slots
    [items[from], items[to]] = [items[to], items[from]];
    const finalStats = derive({ ...get(), items });
    set({ items, finalStats });
  },

  setEmblem(emblem) {
    const talents = EMPTY_TALENTS;
    const finalStats = derive({ ...get(), emblem, talents });
    set({ emblem, talents, finalStats });
  },

  setTalent(slot, node) {
    const talents = { ...get().talents, [slot]: node };
    const finalStats = derive({ ...get(), talents });
    set({ talents, finalStats });
  },

  setSpell(spell) {
    const finalStats = derive({ ...get(), spell });
    set({ spell, finalStats });
  },

  setLoadedSkills(loadedSkills) {
    const activeSkillIds: string[] = [];
    const finalStats = derive({ ...get(), loadedSkills, activeSkillIds });
    set({ loadedSkills, activeSkillIds, finalStats });
  },

  toggleSkill(id) {
    const prev = get().activeSkillIds;
    const activeSkillIds = prev.includes(id)
      ? prev.filter((x) => x !== id)
      : [...prev, id];
    const finalStats = derive({ ...get(), activeSkillIds });
    set({ activeSkillIds, finalStats });
  },

  setLoadedBuilds(builds) {
    set({ loadedBuilds: builds });
  },

  applyBuild(build) {
    // Fill item slots in order; remaining slots are null
    const items: (ItemOption | null)[] = Array(MAX_ITEMS).fill(null);
    for (const bi of build.items) {
      const slot = bi.slot - 1; // DB slots are 1-indexed
      if (slot >= 0 && slot < MAX_ITEMS) items[slot] = bi.item;
    }
    const spell = build.spell;
    const level = build.heroLevel;
    const emblem = build.emblem;
    const talents = build.talents;
    const finalStats = derive({ ...get(), items, spell, level, emblem, talents });
    set({ items, spell, level, emblem, talents, finalStats });
  },

  setItemCondition(key, value) {
    const itemConditions = { ...get().itemConditions, [key]: value };
    const finalStats = derive({ ...get(), itemConditions });
    set({ itemConditions, finalStats });
  },
}));
