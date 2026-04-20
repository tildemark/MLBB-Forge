"use client";

/**
 * Client shell — 2-tab layout: Hero | Info
 *
 * Tab 1 Hero  — hero picker, equipment (1 row), emblem/spell (compact row), stat sheet, skills, build suggestions
 * Tab 2 Info  — per-level growth table, permanent hero constants
 */

import { useState, useEffect, useCallback } from "react";
import { Sword, BookOpen, Link2, Check } from "lucide-react";
import { AuthButton } from "@/components/AuthButton";
import {
  HeroSection,
  SkillsSection,
  CompactBuildRow,
} from "@/components/panes/LeftPane";
import { EquipmentSection, BuildSuggestionsSection, SkillDamageSection, CombatConditionsSection, SkillInfoSection } from "@/components/panes/CenterPane";
import { StatSheet, GrowthTable } from "@/components/panes/RightPane";
import { useForgeStore, type HeroOption, type EmblemOption, type SpellOption, type ItemOption } from "@/lib/store";
import type { HeroBaseStats } from "@/lib/calc";
import { encodeShareState, decodeShareState } from "@/lib/share";
import { cdnUrl } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Hero profile card — shown at top of Info tab
// ---------------------------------------------------------------------------

const ROLE_CDN_FILE: Record<string, string> = {
  fighter:  "fighter.png",
  assassin: "assassin.png",
  mage:     "mage.png",
  marksman: "marksman.png",
  support:  "support.png",
  tank:     "tank.png",
};

const LANE_CDN_FILE: Record<string, string> = {
  "gold lane": "gold-lane.svg",
  "exp lane":  "exp-lane.svg",
  "mid lane":  "mid-lane.svg",
  roaming:     "roam.svg",
  roam:        "roam.svg",
  jungle:      "jungle.svg",
};

function HeroProfileCard() {
  const hero = useForgeStore((s) => s.hero);
  if (!hero) return (
    <div className="rounded-xl border border-forge-border bg-forge-surface p-6 text-center text-white/30 text-sm">
      Select a hero on the Hero tab to see their profile.
    </div>
  );

  const lanes = hero.lane ? hero.lane.split("/").map((l) => l.trim()) : [];

  return (
    <div className="rounded-xl border border-forge-border bg-forge-surface overflow-hidden">
      {/* Portrait + identity */}
      <div className="flex items-center gap-4 p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cdnUrl("heroes", hero.imageFile)}
          alt={hero.name}
          className="h-20 w-20 rounded-xl object-cover ring-2 ring-forge-border shrink-0"
          onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.2"; }}
        />
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-white leading-tight">{hero.name}</h2>
          {hero.title && (
            <p className="text-sm text-white/40 mt-0.5">{hero.title}</p>
          )}
          {/* Role icons */}
          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            {hero.role.map((r) => {
              const file = ROLE_CDN_FILE[r.toLowerCase()];
              return file ? (
                <img
                  key={r}
                  src={cdnUrl("roles", file)}
                  alt={r}
                  title={r}
                  className="h-6 w-6 object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0"; }}
                />
              ) : (
                <span key={r} className="text-[10px] font-semibold uppercase text-white/50 bg-forge-border px-1.5 py-0.5 rounded">{r}</span>
              );
            })}
            {lanes.map((l) => {
              const file = LANE_CDN_FILE[l.toLowerCase()];
              return file ? (
                <img
                  key={l}
                  src={cdnUrl("lanes", file)}
                  alt={l}
                  title={l}
                  className="h-6 w-6 object-contain opacity-70"
                  onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0"; }}
                />
              ) : null;
            })}
          </div>
        </div>
      </div>

      {/* Metadata pills */}
      <div className="border-t border-forge-border px-4 py-3 flex flex-wrap gap-2">
        {hero.atkType && <Pill label="Attack" value={hero.atkType} />}
        {hero.dmgType && <Pill label="Damage" value={hero.dmgType} />}
        {hero.resource && hero.resource !== "None" && <Pill label="Resource" value={hero.resource} />}
        {hero.specialty && hero.specialty.split("/").map((s) => (
          <Pill key={s} label="Specialty" value={s.trim()} />
        ))}
        {lanes.length > 0 && <Pill label="Lane" value={lanes.join(" / ")} />}
      </div>
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-forge-border bg-forge-bg px-2.5 py-0.5 text-xs text-white/70">
      <span className="text-white/30">{label}</span>
      {value}
    </span>
  );
}

type Tab = "hero" | "info";

const TABS: { id: Tab; label: string; Icon: React.ElementType }[] = [
  { id: "hero",  label: "Hero",  Icon: Sword },
  { id: "info",  label: "Info",  Icon: BookOpen },
];

export function ForgeSandbox({
  heroes,
  items,
  emblems,
  spells,
  patchVersion,
}: {
  heroes: Array<HeroOption & { statsRecord: HeroBaseStats | null; specialty: string | null }>;
  items: ItemOption[];
  emblems: EmblemOption[];
  spells: SpellOption[];
  patchVersion: string;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("hero");
  const [shareCopied, setShareCopied] = useState(false);

  const hero = useForgeStore((s) => s.hero);
  const level = useForgeStore((s) => s.level);
  const storeItems = useForgeStore((s) => s.items);
  const storeSpell = useForgeStore((s) => s.spell);
  const storeEmblem = useForgeStore((s) => s.emblem);
  const storeTalents = useForgeStore((s) => s.talents);
  const setHero = useForgeStore((s) => s.setHero);
  const setLevel = useForgeStore((s) => s.setLevel);
  const setItem = useForgeStore((s) => s.setItem);
  const setSpell = useForgeStore((s) => s.setSpell);
  const setEmblem = useForgeStore((s) => s.setEmblem);
  const setTalent = useForgeStore((s) => s.setTalent);

  // On mount: decode ?b= URL param and restore build state
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get("b");
    if (!encoded) return;

    const state = decodeShareState(encoded);
    if (!state) return;

    // Look up hero
    const heroData = heroes.find((h) => h.slug === state.h);
    if (!heroData) return;
    const statsRecord = heroData.statsRecord ?? {
      baseHp: 0, hpGrowth: 0, baseMana: 0, manaGrowth: 0,
      baseAtkPhys: 0, atkPhysGrowth: 0, baseAtkMag: 0, atkMagGrowth: 0,
      baseArmor: 0, armorGrowth: 0, baseMagRes: 0, magResGrowth: 0,
      baseMoveSpeed: 0, baseAttackSpd: 0, atkSpdGrowth: 0,
      baseHpRegen: 0, baseManaRegen: 0,
    };
    setHero(heroData, statsRecord);
    setLevel(state.lv);

    // Items
    for (let i = 0; i < 6; i++) {
      const slug = state.items[i] ?? null;
      const item = slug ? items.find((it) => it.slug === slug) ?? null : null;
      setItem(i, item);
    }

    // Spell
    const spell = state.spell ? spells.find((s) => s.slug === state.spell) ?? null : null;
    setSpell(spell);

    // Emblem
    const emblem = state.emblem ? emblems.find((e) => e.slug === state.emblem) ?? null : null;
    setEmblem(emblem ?? null);

    // Talent nodes — search across all emblem trees
    if (state.nodes.length > 0 && emblem) {
      const allNodes = emblems.flatMap((e) => e.nodes);
      const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
      for (const nodeId of state.nodes) {
        const node = nodeMap.get(nodeId);
        if (!node) continue;
        if (node.tier === 1) setTalent("standard1", node);
        else if (node.tier === 2) setTalent("standard2", node);
        else if (node.tier === 3) setTalent("core", node);
      }
    }

    // Remove the ?b= param from the URL without reloading
    const url = new URL(window.location.href);
    url.searchParams.delete("b");
    window.history.replaceState(null, "", url.toString());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleShareBuild = useCallback(() => {
    if (!hero) return;
    const state = encodeShareState({
      h: hero.slug,
      lv: level,
      items: storeItems.map((i) => i?.slug ?? null),
      spell: storeSpell?.slug ?? null,
      emblem: storeEmblem?.slug ?? null,
      nodes: [storeTalents.standard1?.id, storeTalents.standard2?.id, storeTalents.core?.id].filter(Boolean) as string[],
    });
    const url = `${window.location.origin}/?b=${state}`;
    navigator.clipboard.writeText(url).catch(() => {});
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }, [hero, level, storeItems, storeSpell, storeEmblem, storeTalents]);

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-forge-bg text-white">
      {/* ── Top bar ── */}
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-forge-border bg-forge-surface px-4">
        <span className="font-cinzel text-sm tracking-widest text-forge-gold">MLBB Forge</span>
        <div className="flex items-center gap-2">
          <span className="rounded border border-forge-border px-2 py-0.5 text-[11px] text-white/40">
            Patch {patchVersion}
          </span>
          {hero && (
            <button
              onClick={handleShareBuild}
              title="Copy shareable build link"
              className="flex items-center gap-1 rounded border border-forge-border px-2 py-0.5 text-[11px] text-white/40 hover:text-white/70 hover:border-white/30 transition-colors"
            >
              {shareCopied ? <Check className="h-3 w-3 text-emerald-400" /> : <Link2 className="h-3 w-3" />}
              {shareCopied ? "Copied!" : "Share"}
            </button>
          )}
          <AuthButton />
        </div>
      </header>

      {/* ── Tab strip ── */}
      <nav className="flex shrink-0 border-b border-forge-border bg-forge-surface">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`relative flex flex-1 items-center justify-center gap-2 py-2.5 text-xs font-semibold uppercase tracking-widest transition-colors ${
              activeTab === id
                ? "text-forge-gold"
                : "text-white/40 hover:text-white/70"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
            {activeTab === id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-forge-gold" />
            )}
          </button>
        ))}
      </nav>

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-y-auto">
        {/* ── TAB 1: Hero + Build (merged) ── */}
        {activeTab === "hero" && (
          <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
            <HeroSection heroes={heroes} />
            <StatSheet />
            <CompactBuildRow emblems={emblems} spells={spells} />
            <EquipmentSection items={items} />
            <CombatConditionsSection />
            <SkillDamageSection />
            <BuildSuggestionsSection items={items} emblems={emblems} spells={spells} />
          </div>
        )}

        {/* ── TAB 2: Info ── */}
        {activeTab === "info" && (
          <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
            <HeroProfileCard />
            <SkillInfoSection />
            <GrowthTable />
          </div>
        )}
      </div>
    </div>
  );
}
