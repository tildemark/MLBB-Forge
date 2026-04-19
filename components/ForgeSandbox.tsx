"use client";

/**
 * Client shell — 2-tab layout: Hero | Info
 *
 * Tab 1 Hero  — hero picker, equipment (1 row), emblem/spell (compact row), stat sheet, skills, build suggestions
 * Tab 2 Info  — per-level growth table, permanent hero constants
 */

import { useState } from "react";
import { Sword, BookOpen } from "lucide-react";
import {
  HeroSection,
  SkillsSection,
  CompactBuildRow,
} from "@/components/panes/LeftPane";
import { EquipmentSection, BuildSuggestionsSection } from "@/components/panes/CenterPane";
import { StatSheet, GrowthTable } from "@/components/panes/RightPane";
import type { HeroOption, EmblemOption, SpellOption, ItemOption } from "@/lib/store";
import type { HeroBaseStats } from "@/lib/calc";

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

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-forge-bg text-white">
      {/* ── Top bar ── */}
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-forge-border bg-forge-surface px-4">
        <span className="font-cinzel text-sm tracking-widest text-forge-gold">MLBB Forge</span>
        <span className="rounded border border-forge-border px-2 py-0.5 text-[11px] text-white/40">
          Patch {patchVersion}
        </span>
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
            <BuildSuggestionsSection items={items} />
          </div>
        )}

        {/* ── TAB 2: Info ── */}
        {activeTab === "info" && (
          <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
            <GrowthTable />
          </div>
        )}
      </div>
    </div>
  );
}
