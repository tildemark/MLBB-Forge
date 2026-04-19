"use server";

import { prisma } from "@/lib/prisma";
import type { ItemOption, SpellOption, EmblemOption, EmblemNode, TalentSelection } from "@/lib/store";
import type { ItemStats } from "@/lib/calc";
import { BUILD_ARCHETYPES } from "@/lib/build-config";

export type { BuildArchetype, BuildTab, BUILD_TABS } from "@/lib/build-config";

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
  title: string;
  description: string | null;
  heroLevel: number;
  upvotes: number;
  /** Tags stored in DB, merged with auto-inferred archetype tags */
  tags: BuildTab[];
  items: Array<{ slot: number; item: ItemOption }>;
  spell: SpellOption | null;
  emblem: EmblemOption | null;
  talents: TalentSelection;
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
  const patch = await prisma.patchVersion.findFirst({ where: { isLatest: true } });
  if (!patch) return [];

  const builds = await prisma.build.findMany({
    where: { heroId, isPublic: true },
    orderBy: [{ upvotes: "desc" }, { createdAt: "desc" }],
    take: 20,
    include: {
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

  // Batch-load emblem trees referenced by these builds
  const emblemSlugs = [...new Set(builds.map((b) => b.emblemSlug).filter(Boolean) as string[])];
  const emblemTrees = emblemSlugs.length
    ? await prisma.emblemTree.findMany({
        where: { slug: { in: emblemSlugs } },
        include: { nodes: true },
      })
    : [];
  const emblemBySlug = new Map(emblemTrees.map((e) => [e.slug, e]));

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
      for (const nodeId of b.emblemNodeIds) {
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) continue;
        if (node.tier === 1) talents.standard1 = node;
        else if (node.tier === 2) talents.standard2 = node;
        else if (node.tier === 3) talents.core = node;
      }
    }

    // Merge DB-stored tags with inferred archetype tags
    const itemStatsList = mappedItems.map((bi) => bi.item.stats);
    const inferred = inferBuildTags(itemStatsList);
    const dbTags = (b.tags ?? []) as BuildTab[];
    const allTags: BuildTab[] = [...new Set([...dbTags, ...inferred])];

    return {
      id: b.id,
      title: b.title,
      description: b.description ?? null,
      heroLevel: b.heroLevel,
      upvotes: b.upvotes,
      tags: allTags,
      spell: b.spell
        ? { slug: b.spell.slug, name: b.spell.name, imageFile: b.spell.imageFile, description: b.spell.description }
        : null,
      items: mappedItems,
      emblem,
      talents,
    };
  });
}
