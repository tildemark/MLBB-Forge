"use server";

import { prisma } from "@/lib/prisma";
import { rlIncr, cacheGet, cacheSet, cacheDel } from "@/lib/redis";
import type { ItemOption, SpellOption, EmblemOption, EmblemNode, TalentSelection } from "@/lib/store";
import type { ItemStats } from "@/lib/calc";
import { BUILD_ARCHETYPES, type BuildArchetype, type BuildTab } from "@/lib/build-config";

export type { BuildArchetype, BuildTab, BUILD_TABS } from "@/lib/build-config";

// ---------------------------------------------------------------------------
// Hero guide (skill priority + combos) — sourced from OpenMLBB & mobilelegends.com
// ---------------------------------------------------------------------------
export interface HeroGuideData {
  /** e.g. "3-2-1" — skill slot priority order (highest to lowest) */
  priorityLabel: string | null;
  /** Slot names in priority order, e.g. ["ULT","S2","S1"] */
  prioritySlots: string[];
}

export interface SkillCombo {
  type: "TEAMFIGHT" | "LANING";
  /** External skill icon URLs (from akmweb CDN) in order */
  iconUrls: string[];
  description: string;
}

const OPENMLBB_HERO = "https://openmlbb.fastapicloud.dev/api/heroes";

export async function fetchHeroGuide(heroSlug: string): Promise<HeroGuideData> {
  try {
    const res = await fetch(`${OPENMLBB_HERO}/${encodeURIComponent(heroSlug)}?lang=en`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return { priorityLabel: null, prioritySlots: [] };
    const json = await res.json();
    const heroData = json?.data?.records?.[0]?.data?.hero?.data ?? null;
    const priorityLabel: string | null = heroData?.recommendlevellabel ?? null;
    const priorityNums: string[] = heroData?.recommendlevel ?? [];

    // Map numeric skill positions to slot names.
    // MLBB counts active skills only (excluding passive): 1=S1, 2=S2, 3=S3 or ULT, 4=ULT if 4 actives.
    // Find max number — that always maps to ULT (S4).
    const nums = priorityNums.map(Number).filter((n) => !isNaN(n));
    const maxN = nums.length > 0 ? Math.max(...nums) : 0;
    const numToSlot = (n: number): string => {
      if (n === maxN) return "ULT";
      if (n === 1)    return "S1";
      if (n === 2)    return "S2";
      if (n === 3)    return "S3";
      return `S${n}`;
    };
    const prioritySlots = nums.map(numToSlot);

    return { priorityLabel, prioritySlots };
  } catch {
    return { priorityLabel: null, prioritySlots: [] };
  }
}

// ---------------------------------------------------------------------------
// Skill combos — scraped from mobilelegends.com via Jina AI reader
// ---------------------------------------------------------------------------

function parseCombosFromMarkdown(markdown: string): SkillCombo[] {
  const combos: SkillCombo[] = [];
  const sections: Array<{ type: "TEAMFIGHT" | "LANING"; start: number }> = [];

  const tf = markdown.indexOf("TEAMFIGHT COMBOS");
  const ln = markdown.indexOf("LANING COMBOS");
  if (tf >= 0) sections.push({ type: "TEAMFIGHT", start: tf + "TEAMFIGHT COMBOS".length });
  if (ln >= 0) sections.push({ type: "LANING",    start: ln + "LANING COMBOS".length });
  sections.sort((a, b) => a.start - b.start);

  for (let i = 0; i < sections.length; i++) {
    const { type, start } = sections[i];
    const end = sections[i + 1]?.start ?? markdown.length;
    const text = markdown.substring(start, end);

    // Extract skill icon URLs — only .png images from svnres (not arrow SVGs)
    const iconUrls: string[] = [];
    const iconRe = /!\[[^\]]*\]\((https:\/\/akmweb[^\)]+\.png)\)/g;
    let m: RegExpExecArray | null;
    while ((m = iconRe.exec(text)) !== null) {
      iconUrls.push(m[1]);
    }

    // Description: plain text lines (no markdown images or headers)
    const descLines = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("!") && !l.startsWith("#"));
    const description = descLines.join(" ").trim();

    if (iconUrls.length > 0 || description) {
      combos.push({ type, iconUrls, description });
    }
  }

  return combos;
}

export async function fetchHeroCombos(heroSlug: string): Promise<SkillCombo[]> {
  try {
    // Step 1: Resolve hero_id from OpenMLBB (cached 24h)
    const openRes = await fetch(
      `${OPENMLBB_HERO}/${encodeURIComponent(heroSlug)}?lang=en`,
      { next: { revalidate: 86400 } },
    );
    if (!openRes.ok) return [];
    const json = await openRes.json();
    const heroId: number | null = json?.data?.records?.[0]?.hero_id ?? null;
    if (!heroId) return [];

    // Step 2: Fetch the mobilelegends.com hero detail page via Jina AI reader
    // Jina AI renders client-side JS and returns clean markdown text (no auth needed)
    const jinaUrl = `https://r.jina.ai/https://www.mobilelegends.com/hero/detail?heroid=${heroId}`;
    const jinaRes = await fetch(jinaUrl, {
      next: { revalidate: 86400 },
      headers: { Accept: "text/plain" },
    });
    if (!jinaRes.ok) return [];
    const markdown = await jinaRes.text();

    return parseCombosFromMarkdown(markdown);
  } catch {
    return [];
  }
}

export interface SkillData {
  id: string;
  slot: "PASSIVE" | "S1" | "S2" | "S3" | "S4";
  name: string;
  description: string;
  imageFile: string;
}

export async function fetchHeroSkills(heroId: string): Promise<SkillData[]> {
  const skills = await prisma.skill.findMany({
    where: { heroId },
    orderBy: { slot: "asc" },
    select: { id: true, slot: true, name: true, description: true, imageFile: true },
  });
  return skills.map((s) => ({ ...s, slot: s.slot as SkillData["slot"] }));
}

// ---------------------------------------------------------------------------
// Skills with scaling data (for Skill Damage Breakdown)
// ---------------------------------------------------------------------------

export interface SkillScalingRow {
  level: number;
  baseDamage: number | null;
  physScaling: number | null;
  magScaling: number | null;
  cooldown: number | null;
  manaCost: number | null;
  notes: string | null;
}

export interface SkillWithScalings extends SkillData {
  scalings: SkillScalingRow[];
}

export async function fetchHeroSkillsWithScalings(heroId: string): Promise<SkillWithScalings[]> {
  const skills = await prisma.skill.findMany({
    where: { heroId },
    orderBy: { slot: "asc" },
    include: { scalings: { orderBy: { level: "asc" } } },
  });
  return skills.map((s) => ({
    id: s.id,
    slot: s.slot as SkillData["slot"],
    name: s.name,
    description: s.description,
    imageFile: s.imageFile,
    scalings: s.scalings.map((sc) => ({
      level: sc.level,
      baseDamage: sc.baseDamage,
      physScaling: sc.physScaling,
      magScaling: sc.magScaling,
      cooldown: sc.cooldown,
      manaCost: sc.manaCost,
      notes: sc.notes ?? null,
    })),
  }));
}

// ---------------------------------------------------------------------------
// Build archetypes
// ---------------------------------------------------------------------------

/** Infer archetype tags from a build's aggregated item stats. */
function inferBuildTags(itemStatsList: ItemStats[]): BuildArchetype[] {
  const sum = (key: keyof ItemStats): number =>
    itemStatsList.reduce((acc, s) => acc + (s[key] ?? 0), 0);

  const count = (key: keyof ItemStats): number =>
    itemStatsList.filter((s) => (s[key] ?? 0) > 0).length;

  const tags = new Set<BuildArchetype>();

  if (sum("critRate") >= 20 || sum("critDmg") >= 30)   tags.add("Crit");
  if (sum("atkSpd") >= 25 || count("atkSpd") >= 2)      tags.add("Attack Speed");
  if (sum("magPower") >= 250)                            tags.add("Magic");
  if (sum("physAtk") >= 300 && !tags.has("Magic"))       tags.add("Full Damage");
  if (sum("hp") >= 1200 || sum("armor") >= 80 || sum("magRes") >= 80) tags.add("Tank");
  if (sum("lifesteal") >= 15 || sum("magLifesteal") >= 15) tags.add("Lifesteal");
  if (sum("cd") >= 15 || count("cd") >= 2)               tags.add("Utility");
  if (sum("physPen") >= 30 || sum("magPen") >= 30 ||
      sum("physPenPct") >= 20 || sum("magPenPct") >= 20) tags.add("Poke");

  // Fallback: at least one tag
  if (tags.size === 0) tags.add("Full Damage");

  return [...tags];
}

// ---------------------------------------------------------------------------
// Build suggestion shape
// ---------------------------------------------------------------------------

export interface BuildSuggestion {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  heroLevel: number;
  upvotes: number;
  downvotes: number;
  /** Tags stored in DB, merged with auto-inferred archetype tags */
  tags: BuildTab[];
  items: Array<{ slot: number; item: ItemOption }>;
  spell: SpellOption | null;
  emblem: EmblemOption | null;
  talents: TalentSelection;
  authorName: string | null;
}

function mapItemStats(s: {
  hp: number; mana: number; physAtk: number; magPower: number;
  physDef: number; magDef: number; physPenFlat: number; physPenPct: number;
  magPenFlat: number; magPenPct: number; critRate: number; critDamage: number;
  attackSpeed: number; lifeSteal: number; spellVamp: number; cdr: number;
  moveSpeed: number; hpRegen: number;
} | null): ItemStats {
  if (!s) return {};
  return {
    hp: s.hp || undefined,
    mana: s.mana || undefined,
    physAtk: s.physAtk || undefined,
    magPower: s.magPower || undefined,
    armor: s.physDef || undefined,
    magRes: s.magDef || undefined,
    physPen: s.physPenFlat || undefined,
    physPenPct: s.physPenPct ? s.physPenPct * 100 : undefined,
    magPen: s.magPenFlat || undefined,
    magPenPct: s.magPenPct ? s.magPenPct * 100 : undefined,
    critRate: s.critRate ? s.critRate * 100 : undefined,
    critDmg: s.critDamage ? s.critDamage * 100 : undefined,
    atkSpd: s.attackSpeed ? s.attackSpeed * 100 : undefined,
    lifesteal: s.lifeSteal ? s.lifeSteal * 100 : undefined,
    magLifesteal: s.spellVamp ? s.spellVamp * 100 : undefined,
    cd: s.cdr ? s.cdr * 100 : undefined,
    moveSpeed: s.moveSpeed || undefined,
    hpRegen: s.hpRegen || undefined,
  };
}

export async function fetchHeroBuilds(heroId: string): Promise<BuildSuggestion[]> {
  const cacheKey = `hero:builds:${heroId}`;
  const cached = await cacheGet<BuildSuggestion[]>(cacheKey);
  if (cached) return cached;

  const patch = await prisma.patchVersion.findFirst({ where: { isLatest: true } });
  if (!patch) return [];

  const builds = await prisma.build.findMany({
    where: { heroId, isPublic: true },
    orderBy: [{ upvotes: "desc" }, { createdAt: "desc" }],
    take: 20,
    include: {
      author: { select: { name: true } },
      spell: true,
      items: {
        include: {
          item: {
            include: { stats: { where: { patchId: patch.id } } },
          },
        },
        orderBy: { slot: "asc" },
      },
    },
  });

  // Batch-load emblem trees and all talent nodes referenced by these builds
  const emblemSlugs = [...new Set(builds.map((b) => b.emblemSlug).filter(Boolean) as string[])];
  const emblemTrees = emblemSlugs.length
    ? await prisma.emblemTree.findMany({
        where: { slug: { in: emblemSlugs } },
        include: { nodes: true },
      })
    : [];
  const emblemBySlug = new Map(emblemTrees.map((e) => [e.slug, e]));

  // Look up any talent node IDs that aren't already covered by the emblem trees above
  const allNodeIds = [...new Set(builds.flatMap((b) => b.emblemNodeIds))];
  const coveredNodeIds = new Set(emblemTrees.flatMap((e) => e.nodes.map((n) => n.id)));
  const extraNodeIds = allNodeIds.filter((id) => !coveredNodeIds.has(id));
  const extraNodes = extraNodeIds.length
    ? await prisma.emblemNode.findMany({
        where: { id: { in: extraNodeIds } },
        include: { tree: true },
      })
    : [];
  const nodeById = new Map<string, { id: string; tier: number; position: number; name: string; description: string; statKey: string | null; statValue: number | null; imageFile: string }>(
    [
      ...emblemTrees.flatMap((e) => e.nodes),
      ...extraNodes,
    ].map((n) => [n.id, { id: n.id, tier: n.tier, position: n.position, name: n.name, description: n.description, statKey: n.statKey ?? null, statValue: n.statValue ?? null, imageFile: n.imageFile }])
  );

  const result: BuildSuggestion[] = builds.map((b) => {
    const mappedItems = b.items.map((bi) => {
      const s = bi.item.stats[0] ?? null;
      return {
        slot: bi.slot,
        item: {
          slug: bi.item.slug,
          name: bi.item.name,
          imageFile: bi.item.imageFile,
          category: bi.item.category as string,
          tier: bi.item.tier,
          goldCost: s?.goldCost ?? 0,
          passiveName: s?.passiveName ?? null,
          passiveDesc: s?.passiveDesc ?? null,
          stats: mapItemStats(s),
        } satisfies ItemOption,
      };
    });

    // Resolve emblem + talents
    const rawTree = b.emblemSlug ? emblemBySlug.get(b.emblemSlug) : null;
    let emblem: EmblemOption | null = null;
    const talents: TalentSelection = { standard1: null, standard2: null, core: null };

    if (rawTree) {
      const nodes: EmblemNode[] = rawTree.nodes.map((n) => ({
        id: n.id,
        tier: n.tier,
        position: n.position,
        name: n.name,
        description: n.description,
        statKey: n.statKey ?? null,
        statValue: n.statValue ?? null,
        imageFile: n.imageFile,
      }));
      emblem = {
        slug: rawTree.slug,
        name: rawTree.name,
        imageFile: rawTree.imageFile,
        attrs: (rawTree.attrs as { name: string; value: number }[] | null) ?? [],
        nodes,
      };
    }

    for (const nodeId of b.emblemNodeIds) {
      const node = nodeById.get(nodeId);
      if (!node) continue;
      if (node.tier === 1) talents.standard1 = node;
      else if (node.tier === 2) talents.standard2 = node;
      else if (node.tier === 3) talents.core = node;
    }

    // Merge DB-stored tags with inferred archetype tags
    const itemStatsList = mappedItems.map((bi) => bi.item.stats);
    const inferred = inferBuildTags(itemStatsList);
    const dbTags = (b.tags ?? []) as BuildTab[];
    const allTags: BuildTab[] = [...new Set([...dbTags, ...inferred])];

    return {
      id: b.id,
      slug: b.slug,
      title: b.title,
      description: b.description ?? null,
      heroLevel: b.heroLevel,
      upvotes: b.upvotes,
      downvotes: b.downvotes,
      tags: allTags,
      authorName: b.author?.name ?? null,
      spell: b.spell
        ? { slug: b.spell.slug, name: b.spell.name, imageFile: b.spell.imageFile, description: b.spell.description }
        : null,
      items: mappedItems,
      emblem,
      talents,
    };
  });

  await cacheSet(cacheKey, result, 60);
  return result;
}


// ---------------------------------------------------------------------------

const MLBBGG_BASE = "https://back.mlbb.gg/api/v1";

/** Normalise a display name into a slug matching our DB convention */
function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/['\u2019\u2018]/g, "")   // strip apostrophes
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Normalise spell name → our DB slug.
 * mlbb.gg uses "Ice Retribution", "Bloody Retribution" etc. for jungle variants.
 */
function spellNameToSlug(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("retribution")) return "retribution";
  if (lower.includes("conceal")) return "conceal";
  return nameToSlug(name);
}

/** Module-level cache: hero name (lowercase) → mlbb.gg numeric ID */
let _heroIdCache: Map<string, number> | null = null;

async function getMlbbGgHeroId(heroName: string): Promise<number | null> {
  if (!_heroIdCache) {
    try {
      const res = await fetch(`${MLBBGG_BASE}/heroes`, { next: { revalidate: 86400 } });
      if (!res.ok) return null;
      const list = await res.json() as { id: number; name: string }[];
      _heroIdCache = new Map(list.map((h) => [h.name.toLowerCase(), h.id]));
    } catch {
      return null;
    }
  }
  return _heroIdCache.get(heroName.toLowerCase()) ?? null;
}

export interface ExternalEmblemInfo {
  name: string;
  imageUrl: string;
}

export interface ExternalBuildRecord {
  id: string;
  title: string;
  description: string | null;
  /** Item slugs in build slot order (up to 6) */
  equipSlugs: string[];
  spellSlug: string | null;
  spellName: string | null;
  spellImageUrl: string | null;
  emblem: ExternalEmblemInfo | null;
  talentStandard1: ExternalEmblemInfo | null;
  talentStandard2: ExternalEmblemInfo | null;
  talentCore: ExternalEmblemInfo | null;
  votes: number;
  views: number;
  authorName: string | null;
  /** Win rate (0–1) from OpenMLBB win-rate builds */
  winRate?: number;
  /** Pick rate (0–1) from OpenMLBB win-rate builds */
  pickRate?: number;
}

export async function fetchExternalBuilds(heroName: string): Promise<ExternalBuildRecord[]> {
  try {
    const heroId = await getMlbbGgHeroId(heroName);
    if (!heroId) return [];

    const res = await fetch(`${MLBBGG_BASE}/heroes/${heroId}/builds`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];

    type MlbbGgItem = { id: number; title: string };
    type MlbbGgSpell = { id: number; name: string; image: string };
    type MlbbGgEmblem = { id: number; title: string; class: string; image: string };
    type MlbbGgBuild = {
      id: number;
      name: string;
      items: MlbbGgItem[];
      spells: MlbbGgSpell[];
      parent_emblem: MlbbGgEmblem | null;
      standard_first_emblem: MlbbGgEmblem | null;
      standard_second_emblem: MlbbGgEmblem | null;
      core_emblem: MlbbGgEmblem | null;
    };

    const json = await res.json() as { data: MlbbGgBuild[] };
    const builds = json?.data ?? [];

    const toEmblemInfo = (e: MlbbGgEmblem | null): ExternalEmblemInfo | null =>
      e ? { name: e.title, imageUrl: e.image } : null;

    return builds.map((b): ExternalBuildRecord => {
      const equipSlugs = b.items.map((i) => nameToSlug(i.title));
      const spell = b.spells?.[0] ?? null;
      const spellSlug = spell ? spellNameToSlug(spell.name) : null;

      return {
        id: String(b.id),
        title: b.name,
        description: null,
        equipSlugs,
        spellSlug,
        spellName: spell?.name ?? null,
        spellImageUrl: spell?.image ?? null,
        emblem: toEmblemInfo(b.parent_emblem),
        talentStandard1: toEmblemInfo(b.standard_first_emblem),
        talentStandard2: toEmblemInfo(b.standard_second_emblem),
        talentCore: toEmblemInfo(b.core_emblem),
        votes: 0,
        views: 0,
        authorName: null,
      };
    });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Win-rate builds — OpenMLBB academy API
// ---------------------------------------------------------------------------

const OPENMLBB_BASE = "https://openmlbb.fastapicloud.dev/api";

/** Cache: equipid → item name (populated once per server lifetime) */
let _equipMap: Map<number, string> | null = null;

/** Cache: giftid → { name, icon, tier } */
let _runeMap: Map<number, { name: string; icon: string; tier: number }> | null = null;

async function getOpenMLBBRuneMap(): Promise<Map<number, { name: string; icon: string; tier: number }>> {
  if (_runeMap) return _runeMap;
  const map = new Map<number, { name: string; icon: string; tier: number }>();
  try {
    const res = await fetch(
      `${OPENMLBB_BASE}/academy/emblems?lang=en&size=200`,
      { next: { revalidate: 86400 } }
    );
    if (res.ok) {
      const json = await res.json() as { data?: { records?: { data: { giftid: number; gifttiers: number; emblemskill?: { skillname?: string; skillicon?: string } } }[] } };
      for (const r of json?.data?.records ?? []) {
        const d = r.data;
        if (d?.giftid && d.emblemskill?.skillname) {
          map.set(d.giftid, {
            name: d.emblemskill.skillname,
            icon: d.emblemskill.skillicon ?? "",
            tier: d.gifttiers,
          });
        }
      }
    }
  } catch { /* fall through with partial map */ }
  _runeMap = map;
  return map;
}

async function getOpenMLBBEquipMap(): Promise<Map<number, string>> {
  if (_equipMap) return _equipMap;
  const map = new Map<number, string>();
  try {
    let index = 1;
    while (true) {
      const res = await fetch(
        `${OPENMLBB_BASE}/academy/equipment/expanded?lang=en&size=50&index=${index}`,
        { next: { revalidate: 86400 } }
      );
      if (!res.ok) break;
      const json = await res.json() as { data?: { records?: { data: { equipid: number; equipname: string } }[] } };
      const records = json?.data?.records ?? [];
      for (const r of records) {
        if (r.data?.equipid && r.data?.equipname) {
          map.set(r.data.equipid, r.data.equipname);
        }
      }
      if (records.length < 50) break;
      index++;
    }
  } catch { /* fall through with partial map */ }
  _equipMap = map;
  return map;
}

/** Map our DB lane string to OpenMLBB lane query param */
function laneToOpenMLBBParam(lane: string | null): string {
  const l = (lane ?? "").toLowerCase();
  if (l.includes("gold"))   return "gold";
  if (l.includes("exp"))    return "exp";
  if (l.includes("jungle")) return "jungle";
  if (l.includes("roam"))   return "roam";
  if (l.includes("mid"))    return "mid";
  return "gold"; // fallback
}

export async function fetchOpenMLBBBuilds(
  heroSlug: string,
  heroLane: string | null
): Promise<ExternalBuildRecord[]> {
  try {
    const lane = laneToOpenMLBBParam(heroLane);
    const [equipMap, runeMap] = await Promise.all([getOpenMLBBEquipMap(), getOpenMLBBRuneMap()]);

    const res = await fetch(
      `${OPENMLBB_BASE}/academy/heroes/${heroSlug}/builds?lane=${lane}`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return [];

    type OMLBBBuild = {
      equipid: number[];
      new_rune_skill?: number[];
      build_win_rate: number;
      build_pick_rate: number;
      battleskill?: { data?: { __data?: { skillname?: string; skillicon?: string } } };
      emblem?: { data?: { emblemname?: string; attriicon?: string } };
    };
    type OMLBBResponse = { code: number; data?: { records?: { data?: { build?: OMLBBBuild[] } }[] } };

    const json = await res.json() as OMLBBResponse;
    if (json.code !== 0) return [];

    const builds: OMLBBBuild[] = json?.data?.records?.[0]?.data?.build ?? [];

    return builds.map((b, i): ExternalBuildRecord => {
      const equipSlugs = b.equipid
        .map((id) => {
          const name = equipMap.get(id);
          return name ? nameToSlug(name) : null;
        })
        .filter((s): s is string => s !== null);

      const spellName = b.battleskill?.data?.__data?.skillname ?? null;
      const spellSlug = spellName ? spellNameToSlug(spellName) : null;
      const spellImageUrl = b.battleskill?.data?.__data?.skillicon ?? null;

      const emblemName = b.emblem?.data?.emblemname ?? null;
      const emblemImageUrl = b.emblem?.data?.attriicon ?? null;

      // Resolve talents by tier: tier1→standard1, tier2→standard2, tier3→core
      let talentStandard1: ExternalEmblemInfo | null = null;
      let talentStandard2: ExternalEmblemInfo | null = null;
      let talentCore: ExternalEmblemInfo | null = null;
      for (const giftid of (b.new_rune_skill ?? [])) {
        const t = runeMap.get(giftid);
        if (!t) continue;
        const info: ExternalEmblemInfo = { name: t.name, imageUrl: t.icon };
        if (t.tier === 1) talentStandard1 = info;
        else if (t.tier === 2) talentStandard2 = info;
        else if (t.tier === 3) talentCore = info;
      }

      const winPct = Math.round((b.build_win_rate ?? 0) * 100);
      const pickPct = ((b.build_pick_rate ?? 0) * 100).toFixed(1);

      return {
        id: `openmlbb-${heroSlug}-${i}`,
        title: `${winPct}% WR · ${pickPct}% Pick`,
        description: null,
        equipSlugs,
        spellSlug,
        spellName,
        spellImageUrl,
        emblem: emblemName ? { name: emblemName, imageUrl: emblemImageUrl ?? "" } : null,
        talentStandard1,
        talentStandard2,
        talentCore,
        votes: 0,
        views: 0,
        authorName: null,
        winRate: b.build_win_rate,
        pickRate: b.build_pick_rate,
      };
    });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Publish Build — authenticated users save their current loadout
// ---------------------------------------------------------------------------

import { auth } from "@/auth";

export async function publishBuild(input: {
  heroId: string;
  title: string;
  description?: string;
  heroLevel: number;
  /** 6-element array (indices 0–5); null means empty slot */
  itemSlugs: (string | null)[];
  spellSlug: string | null;
  emblemSlug: string | null;
  emblemNodeIds: string[];
}): Promise<{ ok: boolean; slug?: string; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not logged in" };

  const userId = (session.user as { id: string }).id;

  // Rate limit: max 10 publishes per 24 hours per user
  const rlCount = await rlIncr(`rl:publish:${userId}`, 86400);
  if (rlCount !== null && rlCount > 10) {
    return { ok: false, error: "Publish limit reached. Try again tomorrow." };
  }

  // Basic validation
  const title = input.title.trim().slice(0, 80);
  if (!title) return { ok: false, error: "Title is required" };

  try {
    const patch = await prisma.patchVersion.findFirst({ where: { isLatest: true } });
    if (!patch) return { ok: false, error: "No active patch version" };

    // Resolve item slugs → IDs
    const slotEntries = input.itemSlugs
      .map((slug, i) => (slug ? { slug, slot: i + 1 } : null))
      .filter((x): x is { slug: string; slot: number } => x !== null);

    const itemRecords = slotEntries.length
      ? await prisma.item.findMany({ where: { slug: { in: slotEntries.map((e) => e.slug) } } })
      : [];
    const slugToId = new Map(itemRecords.map((item) => [item.slug, item.id]));

    // Resolve spell slug → ID
    let spellId: string | null = null;
    if (input.spellSlug) {
      const spell = await prisma.battleSpell.findUnique({ where: { slug: input.spellSlug } });
      spellId = spell?.id ?? null;
    }

    const build = await prisma.build.create({
      data: {
        title,
        description: input.description?.trim() || null,
        heroId: input.heroId,
        patchId: patch.id,
        spellId,
        emblemSlug: input.emblemSlug,
        emblemNodeIds: input.emblemNodeIds,
        heroLevel: input.heroLevel,
        isPublic: true,
        authorId: userId,
        items: {
          create: slotEntries
            .filter((e) => slugToId.has(e.slug))
            .map((e) => ({ slot: e.slot, itemId: slugToId.get(e.slug)! })),
        },
      },
      select: { slug: true },
    });

    // Invalidate the community builds cache for this hero
    await cacheDel(`hero:builds:${input.heroId}`);

    return { ok: true, slug: build.slug };
  } catch (e) {
    console.error("publishBuild error:", e);
    return { ok: false, error: "Failed to save build" };
  }
}

// ---------------------------------------------------------------------------
// Fetch a single build by slug (for share page OG)
// ---------------------------------------------------------------------------

export async function fetchBuildBySlug(slug: string): Promise<BuildSuggestion | null> {
  const patch = await prisma.patchVersion.findFirst({ where: { isLatest: true } });
  if (!patch) return null;

  const b = await prisma.build.findUnique({
    where: { slug, isPublic: true },
    include: {
      author: { select: { name: true } },
      hero: { select: { name: true, slug: true } },
      spell: true,
      items: {
        include: { item: { include: { stats: { where: { patchId: patch.id } } } } },
        orderBy: { slot: "asc" },
      },
    },
  });
  if (!b) return null;

  const emblemTrees = b.emblemSlug
    ? await prisma.emblemTree.findMany({ where: { slug: b.emblemSlug }, include: { nodes: true } })
    : [];
  const rawTree = emblemTrees[0] ?? null;

  // Look up any talent node IDs not covered by the emblem tree
  const coveredNodeIds = new Set(rawTree?.nodes.map((n) => n.id) ?? []);
  const extraNodeIds = b.emblemNodeIds.filter((id) => !coveredNodeIds.has(id));
  const extraNodes = extraNodeIds.length
    ? await prisma.emblemNode.findMany({ where: { id: { in: extraNodeIds } } })
    : [];
  const nodeById = new Map(
    [...(rawTree?.nodes ?? []), ...extraNodes].map((n) => [
      n.id,
      { id: n.id, tier: n.tier, position: n.position, name: n.name, description: n.description, statKey: n.statKey ?? null, statValue: n.statValue ?? null, imageFile: n.imageFile },
    ])
  );

  const mappedItems = b.items.map((bi) => {
    const s = bi.item.stats[0] ?? null;
    return {
      slot: bi.slot,
      item: {
        slug: bi.item.slug,
        name: bi.item.name,
        imageFile: bi.item.imageFile,
        category: bi.item.category as string,
        tier: bi.item.tier,
        goldCost: s?.goldCost ?? 0,
        passiveName: s?.passiveName ?? null,
        passiveDesc: s?.passiveDesc ?? null,
        stats: mapItemStats(s),
      } satisfies ItemOption,
    };
  });

  let emblem: EmblemOption | null = null;
  const talents: TalentSelection = { standard1: null, standard2: null, core: null };
  if (rawTree) {
    const nodes: EmblemNode[] = rawTree.nodes.map((n) => ({
      id: n.id, tier: n.tier, position: n.position, name: n.name,
      description: n.description, statKey: n.statKey ?? null,
      statValue: n.statValue ?? null, imageFile: n.imageFile,
    }));
    emblem = { slug: rawTree.slug, name: rawTree.name, imageFile: rawTree.imageFile,
      attrs: (rawTree.attrs as { name: string; value: number }[] | null) ?? [], nodes };
  }
  for (const nodeId of b.emblemNodeIds) {
    const node = nodeById.get(nodeId);
    if (!node) continue;
    if (node.tier === 1) talents.standard1 = node;
    else if (node.tier === 2) talents.standard2 = node;
    else if (node.tier === 3) talents.core = node;
  }

  const itemStatsList = mappedItems.map((bi) => bi.item.stats);
  const inferred = inferBuildTags(itemStatsList);
  const dbTags = (b.tags ?? []) as BuildTab[];
  const allTags: BuildTab[] = [...new Set([...dbTags, ...inferred])];

  return {
    id: b.id,
    slug: b.slug,
    title: b.title,
    description: b.description ?? null,
    heroLevel: b.heroLevel,
    upvotes: b.upvotes,
    downvotes: b.downvotes,
    tags: allTags,
    authorName: b.author?.name ?? null,
    spell: b.spell ? { slug: b.spell.slug, name: b.spell.name, imageFile: b.spell.imageFile, description: b.spell.description } : null,
    items: mappedItems,
    emblem,
    talents,
    // Extra fields available via cast for share page
    heroName: (b.hero as { name: string }).name,
    heroSlug: (b.hero as { slug: string }).slug,
  } as BuildSuggestion & { heroName: string; heroSlug: string };
}

// ---------------------------------------------------------------------------
// Vote on a Build — authenticated users upvote or downvote
// ---------------------------------------------------------------------------

export async function voteBuild(
  buildId: string,
  direction: "up" | "down",
): Promise<{ ok: boolean; upvotes?: number; downvotes?: number; userVote?: "up" | "down" | null; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not logged in" };
  const userId = (session.user as { id: string }).id;

  // Rate limit: max 200 votes per hour per user
  const rlCount = await rlIncr(`rl:vote:${userId}`, 3600);
  if (rlCount !== null && rlCount > 200) {
    return { ok: false, error: "Too many votes. Try again later." };
  }

  try {
    const existing = await prisma.buildVote.findUnique({
      where: { buildId_userId: { buildId, userId } },
    });

    let upDelta = 0;
    let downDelta = 0;
    let newVote: "up" | "down" | null;

    if (existing) {
      if (existing.direction === direction) {
        // Toggle off — remove vote
        await prisma.buildVote.delete({ where: { buildId_userId: { buildId, userId } } });
        upDelta   = direction === "up"   ? -1 : 0;
        downDelta = direction === "down" ? -1 : 0;
        newVote = null;
      } else {
        // Flip vote
        await prisma.buildVote.update({
          where: { buildId_userId: { buildId, userId } },
          data: { direction },
        });
        upDelta   = direction === "up"   ?  1 : -1;
        downDelta = direction === "down" ?  1 : -1;
        newVote = direction;
      }
    } else {
      await prisma.buildVote.create({ data: { buildId, userId, direction } });
      upDelta   = direction === "up"   ? 1 : 0;
      downDelta = direction === "down" ? 1 : 0;
      newVote = direction;
    }

    const updated = await prisma.build.update({
      where: { id: buildId },
      data: {
        upvotes:   { increment: upDelta },
        downvotes: { increment: downDelta },
      },
      select: { upvotes: true, downvotes: true },
    });

    return { ok: true, upvotes: updated.upvotes, downvotes: updated.downvotes, userVote: newVote };
  } catch (e) {
    console.error("voteBuild error:", e);
    return { ok: false, error: "Failed to vote" };
  }
}

// ---------------------------------------------------------------------------
// Personal Garage — authenticated user's own builds for a hero
// ---------------------------------------------------------------------------

export async function fetchMyBuildsForHero(heroId: string): Promise<BuildSuggestion[]> {
  const session = await auth();
  if (!session?.user?.id) return [];
  const userId = (session.user as { id: string }).id;

  const patch = await prisma.patchVersion.findFirst({ where: { isLatest: true } });
  if (!patch) return [];

  const builds = await prisma.build.findMany({
    where: { heroId, authorId: userId },
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { name: true } },
      spell: true,
      items: {
        include: { item: { include: { stats: { where: { patchId: patch.id } } } } },
        orderBy: { slot: "asc" },
      },
    },
  });

  const emblemSlugs = [...new Set(builds.map((b) => b.emblemSlug).filter(Boolean) as string[])];
  const emblemTrees = emblemSlugs.length
    ? await prisma.emblemTree.findMany({ where: { slug: { in: emblemSlugs } }, include: { nodes: true } })
    : [];
  const emblemBySlug = new Map(emblemTrees.map((e) => [e.slug, e]));

  const allNodeIds = [...new Set(builds.flatMap((b) => b.emblemNodeIds))];
  const coveredNodeIds = new Set(emblemTrees.flatMap((e) => e.nodes.map((n) => n.id)));
  const extraNodeIds = allNodeIds.filter((id) => !coveredNodeIds.has(id));
  const extraNodes = extraNodeIds.length
    ? await prisma.emblemNode.findMany({ where: { id: { in: extraNodeIds } } })
    : [];
  const nodeById = new Map(
    [...emblemTrees.flatMap((e) => e.nodes), ...extraNodes].map((n) => [
      n.id,
      { id: n.id, tier: n.tier, position: n.position, name: n.name, description: n.description, statKey: n.statKey ?? null, statValue: n.statValue ?? null, imageFile: n.imageFile },
    ])
  );

  return builds.map((b) => {
    const mappedItems = b.items.map((bi) => {
      const s = bi.item.stats[0] ?? null;
      return {
        slot: bi.slot,
        item: {
          slug: bi.item.slug,
          name: bi.item.name,
          imageFile: bi.item.imageFile,
          category: bi.item.category as string,
          tier: bi.item.tier,
          goldCost: s?.goldCost ?? 0,
          passiveName: s?.passiveName ?? null,
          passiveDesc: s?.passiveDesc ?? null,
          stats: mapItemStats(s),
        } satisfies ItemOption,
      };
    });

    const rawTree = b.emblemSlug ? emblemBySlug.get(b.emblemSlug) : null;
    let emblem: EmblemOption | null = null;
    const talents: TalentSelection = { standard1: null, standard2: null, core: null };
    if (rawTree) {
      const nodes: EmblemNode[] = rawTree.nodes.map((n) => ({
        id: n.id, tier: n.tier, position: n.position, name: n.name,
        description: n.description, statKey: n.statKey ?? null, statValue: n.statValue ?? null, imageFile: n.imageFile,
      }));
      emblem = { slug: rawTree.slug, name: rawTree.name, imageFile: rawTree.imageFile, attrs: (rawTree.attrs as { name: string; value: number }[] | null) ?? [], nodes };
    }
    for (const nodeId of b.emblemNodeIds) {
      const node = nodeById.get(nodeId);
      if (!node) continue;
      if (node.tier === 1) talents.standard1 = node;
      else if (node.tier === 2) talents.standard2 = node;
      else if (node.tier === 3) talents.core = node;
    }

    const itemStatsList = mappedItems.map((bi) => bi.item.stats);
    const inferred = inferBuildTags(itemStatsList);
    const dbTags = (b.tags ?? []) as BuildTab[];
    const allTags: BuildTab[] = [...new Set([...dbTags, ...inferred])];

    return {
      id: b.id,
      slug: b.slug,
      title: b.title,
      description: b.description ?? null,
      heroLevel: b.heroLevel,
      upvotes: b.upvotes,
      downvotes: b.downvotes,
      tags: allTags,
      authorName: b.author?.name ?? null,
      spell: b.spell ? { slug: b.spell.slug, name: b.spell.name, imageFile: b.spell.imageFile, description: b.spell.description } : null,
      items: mappedItems,
      emblem,
      talents,
    };
  });
}

export async function deleteBuild(buildId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not logged in" };
  const userId = (session.user as { id: string }).id;

  try {
    // Verify ownership before deleting
    const build = await prisma.build.findUnique({ where: { id: buildId }, select: { authorId: true, heroId: true } });
    if (!build) return { ok: false, error: "Build not found" };
    if (build.authorId !== userId) return { ok: false, error: "Not your build" };

    await prisma.build.delete({ where: { id: buildId } });
    await cacheDel(`hero:builds:${build.heroId}`);

    return { ok: true };
  } catch (e) {
    console.error("deleteBuild error:", e);
    return { ok: false, error: "Failed to delete build" };
  }
}

// ---------------------------------------------------------------------------
// Clone Build — copy any public build into the current user's garage
// Returns the new build's id so the client can track "saved" state.
// ---------------------------------------------------------------------------

export async function cloneBuild(sourceBuildId: string): Promise<{ ok: boolean; build?: BuildSuggestion; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not logged in" };
  const userId = (session.user as { id: string }).id;

  // Rate limit: same publish cap
  const rlCount = await rlIncr(`rl:publish:${userId}`, 86400);
  if (rlCount !== null && rlCount > 10) {
    return { ok: false, error: "Save limit reached. Try again tomorrow." };
  }

  try {
    const source = await prisma.build.findUnique({
      where: { id: sourceBuildId, isPublic: true },
      include: {
        items: true,
        author: { select: { name: true } },
        spell: true,
      },
    });
    if (!source) return { ok: false, error: "Build not found" };

    // Prevent saving your own build again
    if (source.authorId === userId) return { ok: false, error: "Already yours" };

    const patch = await prisma.patchVersion.findFirst({ where: { isLatest: true } });
    if (!patch) return { ok: false, error: "No active patch" };

    const cloned = await prisma.build.create({
      data: {
        title: source.title,
        description: source.description,
        heroId: source.heroId,
        patchId: patch.id,
        spellId: source.spellId,
        emblemSlug: source.emblemSlug,
        emblemNodeIds: source.emblemNodeIds,
        heroLevel: source.heroLevel,
        isPublic: false, // private to this user's garage
        authorId: userId,
        items: {
          create: source.items.map((bi) => ({ slot: bi.slot, itemId: bi.itemId })),
        },
      },
      select: { id: true },
    });

    await cacheDel(`hero:builds:${source.heroId}`);

    // Return the full BuildSuggestion so the client can add it to myBuilds state immediately
    const full = await fetchMyBuildsForHero(source.heroId);
    const newBuild = full.find((b) => b.id === cloned.id) ?? null;
    if (!newBuild) return { ok: false, error: "Clone succeeded but fetch failed" };

    return { ok: true, build: newBuild };
  } catch (e) {
    console.error("cloneBuild error:", e);
    return { ok: false, error: "Failed to save build" };
  }
}
