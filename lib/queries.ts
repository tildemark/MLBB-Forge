/**
 * Server-side Prisma data fetchers.
 * All functions return plain serialisable objects safe to pass as props.
 */

import { prisma } from "@/lib/prisma";
import type {
  HeroOption,
  HeroStatsRecord,
  ItemOption,
  EmblemOption,
  SpellOption,
} from "@/lib/store";
import type { ItemStats, HeroBaseStats } from "@/lib/calc";

// ---------------------------------------------------------------------------
// Patch version
// ---------------------------------------------------------------------------

export async function getPatchVersion(): Promise<string> {
  const patch = await prisma.patchVersion.findFirst({ where: { isLatest: true } });
  return patch?.version ?? "Unknown";
}

// ---------------------------------------------------------------------------
// Heroes
// ---------------------------------------------------------------------------

export async function getHeroes(): Promise<
  Array<HeroOption & { statsRecord: HeroStatsRecord | null }>
> {
  const patch = await prisma.patchVersion.findFirst({ where: { isLatest: true } });
  if (!patch) return [];

  const heroes = await prisma.hero.findMany({
    include: {
      stats: { where: { patchId: patch.id } },
    },
    orderBy: { name: "asc" },
  });

  return heroes
    .filter((h) => !["ratings", "stats"].includes(h.slug))
    .map((h) => {
      const s = h.stats[0] ?? null;
      const statsRecord: HeroBaseStats | null = s
        ? {
            baseHp: s.baseHp,
            hpGrowth: s.hpGrowth,
            baseMana: s.baseMana,
            manaGrowth: s.manaGrowth,
            baseAtkPhys: s.baseAtkPhys,
            atkPhysGrowth: s.atkPhysGrowth,
            baseAtkMag: s.baseAtkMag,
            atkMagGrowth: s.atkMagGrowth,
            baseArmor: s.baseArmor,
            armorGrowth: s.armorGrowth,
            baseMagRes: s.baseMagRes,
            magResGrowth: s.magResGrowth,
            baseMoveSpeed: s.baseMoveSpeed,
            baseAttackSpd: s.baseAttackSpd,
            atkSpdGrowth: s.atkSpdGrowth,
            baseHpRegen: s.baseHpRegen,
            baseManaRegen: s.baseManaRegen,
          }
        : null;

      return {
        id: h.id,
        slug: h.slug,
        name: h.name,
        title: h.title ?? "",
        role: h.role,
        imageFile: h.imageFile,
        lane: h.lane ?? null,
        resource: h.resource ?? null,
        dmgType: h.dmgType ?? null,
        atkType: h.atkType ?? null,
        specialty: h.specialty ?? null,
        statsRecord,
      };
    });
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export async function getItems(): Promise<ItemOption[]> {
  const patch = await prisma.patchVersion.findFirst({ where: { isLatest: true } });
  if (!patch) return [];

  const items = await prisma.item.findMany({
    where: {
      // Only items that have stats for the current patch (excludes legacy items)
      stats: { some: { patchId: patch.id } },
    },
    include: {
      stats: { where: { patchId: patch.id } },
    },
    orderBy: { name: "asc" },
  });

  return items.map((item) => {
    const s = item.stats[0];
    const stats: ItemStats = s
      ? {
          hp: s.hp || undefined,
          mana: s.mana || undefined,
          physAtk: s.physAtk || undefined,
          magPower: s.magPower || undefined,
          armor: s.physDef || undefined,
          magRes: s.magDef || undefined,
          physPen: s.physPenFlat || undefined,
          physPenPct: s.physPenPct || undefined,
          magPen: s.magPenFlat || undefined,
          magPenPct: s.magPenPct || undefined,
          critRate: s.critRate || undefined,
          critDmg: s.critDamage || undefined,
          atkSpd: s.attackSpeed || undefined,
          lifesteal: s.lifeSteal || undefined,
          magLifesteal: s.spellVamp || undefined,
          cd: s.cdr || undefined,
          moveSpeed: s.moveSpeed || undefined,
          hpRegen: s.hpRegen || undefined,
        }
      : {};

    return {
      slug: item.slug,
      name: item.name,
      imageFile: item.imageFile,
      category: item.category as string,
      tier: item.tier,
      goldCost: s?.goldCost ?? 0,
      passiveName: s?.passiveName ?? null,
      passiveDesc: s?.passiveDesc ?? null,
      stats,
    };
  });
}

// ---------------------------------------------------------------------------
// Emblems
// ---------------------------------------------------------------------------

export async function getEmblems(): Promise<EmblemOption[]> {
  const trees = await prisma.emblemTree.findMany({
    include: { nodes: true },
    orderBy: { name: "asc" },
  });

  return trees.map((t) => ({
    slug: t.slug,
    name: t.name,
    imageFile: t.imageFile,
    attrs: (t.attrs as { name: string; value: number }[] | null) ?? [],
    nodes: t.nodes.map((n) => ({
      id: n.id,
      tier: n.tier,
      position: n.position,
      name: n.name,
      description: n.description,
      statKey: n.statKey ?? null,
      statValue: n.statValue ?? null,
      imageFile: n.imageFile,
    })),
  }));
}

// ---------------------------------------------------------------------------
// Battle Spells
// ---------------------------------------------------------------------------

export async function getSpells(): Promise<SpellOption[]> {
  const spells = await prisma.battleSpell.findMany({ orderBy: { name: "asc" } });
  return spells.map((s) => ({
    slug: s.slug,
    name: s.name,
    description: s.description,
    imageFile: s.imageFile,
  }));
}
