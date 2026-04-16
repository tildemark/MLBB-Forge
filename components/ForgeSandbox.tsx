"use client";

/**
 * Client shell that receives all server-fetched data and renders the three-pane layout.
 * The Zustand store lives here (client-only).
 */

import { LeftPane } from "@/components/panes/LeftPane";
import { CenterPane } from "@/components/panes/CenterPane";
import { RightPane } from "@/components/panes/RightPane";
import type { HeroOption, EmblemOption, SpellOption, ItemOption } from "@/lib/store";
import type { HeroBaseStats } from "@/lib/calc";

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
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-forge-bg text-white">
      {/* Top bar */}
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-forge-border bg-forge-surface px-4">
        <span className="font-cinzel text-sm tracking-widest text-forge-gold">MLBB Forge</span>
        <span className="rounded border border-forge-border px-2 py-0.5 text-[11px] text-white/40">
          Patch {patchVersion}
        </span>
      </header>
      {/* Three-pane layout */}
      <div className="flex flex-1 overflow-hidden">
        <LeftPane heroes={heroes} emblems={emblems} spells={spells} />
        <CenterPane items={items} />
        <RightPane />
      </div>
    </div>
  );
}
