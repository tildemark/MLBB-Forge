"use client";

import Image from "next/image";
import React, { useEffect, useState } from "react";
import { Search, X, Plus, Zap } from "lucide-react";
import { useForgeStore, type ItemOption } from "@/lib/store";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cdnUrl } from "@/lib/utils";
import { fetchHeroBuilds, type BuildSuggestion } from "@/lib/actions";
import { BUILD_TABS, type BuildTab } from "@/lib/build-config";
// ---------------------------------------------------------------------------
// Item stat label map (keys match calc.ts ItemStats; values are already human-scale)
// ---------------------------------------------------------------------------
const STAT_LABELS: { key: string; label: string; pct?: boolean }[] = [
  { key: "hp",           label: "HP" },
  { key: "mana",         label: "Mana" },
  { key: "physAtk",      label: "Physical Attack" },
  { key: "magPower",     label: "Magic Power" },
  { key: "armor",        label: "Physical Defense" },
  { key: "magRes",       label: "Magic Defense" },
  { key: "moveSpeed",    label: "Movement Speed" },
  { key: "atkSpd",       label: "Attack Speed",   pct: true },
  { key: "critRate",     label: "Crit Chance",    pct: true },
  { key: "critDmg",      label: "Crit Damage",    pct: true },
  { key: "physPen",      label: "Phys Pen" },
  { key: "physPenPct",   label: "Phys Pen",       pct: true },
  { key: "magPen",       label: "Magic Pen" },
  { key: "magPenPct",    label: "Magic Pen",      pct: true },
  { key: "lifesteal",    label: "Lifesteal",      pct: true },
  { key: "magLifesteal", label: "Spell Vamp",     pct: true },
  { key: "hpRegen",      label: "HP Regen" },
  { key: "cd",           label: "Cooldown",       pct: true },
];

/** Format a single ItemStats key+value into a human-readable string, or null if unknown. */
function fmtStat(key: string, val: number): string | null {
  const def = STAT_LABELS.find((s) => s.key === key);
  if (!def) return null;
  const display = def.pct ? `${val}%` : String(val);
  return `+${display} ${def.label}`;
}

function ItemStatLines({ stats }: { stats: Record<string, number> }) {
  const lines = STAT_LABELS
    .map(({ key }) => {
      const v = stats[key] ?? 0;
      if (!v) return null;
      return fmtStat(key, v);
    })
    .filter(Boolean) as string[];
  if (!lines.length) return null;
  return (
    <ul className="mt-1 space-y-0.5">
      {lines.map((l) => (
        <li key={l} className="text-[11px] text-emerald-400">{l}</li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Item picker sheet
// ---------------------------------------------------------------------------

const CATEGORIES = ["All", "Attack", "Magic", "Defense", "Movement", "Jungling", "Roaming"];

/** Stat filter tags: label → calc.ts ItemStats keys that must be non-zero */
const STAT_TAGS: { label: string; keys: string[] }[] = [
  { label: "Cooldown",    keys: ["cd"] },
  { label: "Lifesteal",   keys: ["lifesteal"] },
  { label: "Spell Vamp",  keys: ["magLifesteal"] },
  { label: "Crit",        keys: ["critRate", "critDmg"] },
  { label: "Mana",        keys: ["mana"] },
  { label: "Magic Pen",   keys: ["magPen", "magPenPct"] },
  { label: "HP Regen",    keys: ["hpRegen"] },
  { label: "Mov Speed",   keys: ["moveSpeed"] },
  { label: "Atk Speed",   keys: ["atkSpd"] },
  { label: "Magic Power", keys: ["magPower"] },
];

function ItemPickerSheet({
  items,
  slotIndex,
  open,
  onOpenChange,
}: {
  items: ItemOption[];
  slotIndex: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const equipped = useForgeStore((s) => s.items);
  const setItem = useForgeStore((s) => s.setItem);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [statTag, setStatTag] = useState<string | null>(null);

  const equippedSlugs = new Set(equipped.filter(Boolean).map((i) => i!.slug));

  const tagDef = statTag ? STAT_TAGS.find((t) => t.label === statTag) : null;

  const filtered = items.filter((item) => {
    if (query && !item.name.toLowerCase().includes(query.toLowerCase())) return false;
    if (category !== "All" && item.category !== category.toUpperCase()) return false;
    if (tagDef && !tagDef.keys.some((k) => (item.stats as Record<string, number | undefined>)[k])) return false;
    return true;
  });

  function pick(item: ItemOption) {
    setItem(slotIndex, item);
    onOpenChange(false);
  }

  return (
    <SheetContent title="Select Item" side="right" className="w-full max-w-md">
      <div className="flex flex-col h-full pt-10 gap-3 px-4 pb-4">
        <p className="font-cinzel text-forge-gold text-base">Select Item — Slot {slotIndex + 1}</p>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            className="w-full rounded border border-forge-border bg-forge-bg py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/30 focus:border-forge-gold focus:outline-none"
            placeholder="Search items…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* Category tabs */}
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-sm px-2 py-0.5 text-xs font-medium transition-colors ${
                category === c
                  ? "bg-forge-gold text-forge-bg"
                  : "text-white/50 hover:text-white"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Stat filter tags */}
        <div className="flex flex-wrap gap-1">
          {STAT_TAGS.map((t) => (
            <button
              key={t.label}
              onClick={() => setStatTag(statTag === t.label ? null : t.label)}
              className={`rounded-sm border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                statTag === t.label
                  ? "border-forge-gold bg-forge-gold/15 text-forge-gold"
                  : "border-forge-border text-white/40 hover:text-white/70 hover:border-white/30"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Result count */}
        <p className="text-[11px] text-white/25 -mt-1">
          {filtered.length} item{filtered.length !== 1 ? "s" : ""}
          {statTag ? ` with ${statTag}` : ""}
        </p>

        {/* Item list */}
        <ScrollArea className="flex-1">
          <div className="grid grid-cols-1 gap-1 pr-2">
            {filtered.map((item) => {
              const isEquipped = equippedSlugs.has(item.slug);
              const statEntries = Object.entries(item.stats).filter(([, v]) => v);
              return (
                <button
                  key={item.slug}
                  onClick={() => pick(item)}
                  disabled={isEquipped}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                    isEquipped
                      ? "border-forge-gold/30 bg-forge-gold/5 opacity-60 cursor-not-allowed"
                      : "border-forge-border hover:border-forge-gold/50 hover:bg-white/5"
                  }`}
                >
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md">
                    <Image
                      src={cdnUrl("items", item.imageFile)}
                      alt={item.name}
                      fill
                      className="object-contain"
                      unoptimized
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-medium text-white">{item.name}</p>
                      {item.goldCost > 0 && (
                        <span className="shrink-0 text-xs text-forge-gold">{item.goldCost}g</span>
                      )}
                    </div>
                    {statEntries.length > 0 && (
                      <p className="mt-0.5 truncate text-[11px] text-white/50">
                        {statEntries
                          .slice(0, 4)
                          .map(([k, v]) => fmtStat(k, v as number))
                          .filter(Boolean)
                          .join("  ·  ")}
                      </p>
                    )}
                    {item.passiveName && (
                      <p className="mt-0.5 truncate text-[11px] text-forge-gold/80 italic">
                        {item.passiveName}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </SheetContent>
  );
}

// ---------------------------------------------------------------------------
// Item slot button
// ---------------------------------------------------------------------------

function ItemSlot({
  index,
  item,
  items,
  compact = false,
}: {
  index: number;
  item: ItemOption | null;
  items: ItemOption[];
  compact?: boolean;
}) {
  const setItem = useForgeStore((s) => s.setItem);
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip
          content={
            item ? (
              <div className="max-w-[200px]">
                <p className="font-semibold text-forge-gold">{item.name}</p>
                {item.goldCost > 0 && (
                  <p className="text-[11px] text-forge-gold/70">{item.goldCost}g</p>
                )}
                <ItemStatLines stats={item.stats} />
                {item.passiveName && (
                  <p className="mt-1.5 text-[11px] font-semibold text-white/80">{item.passiveName}</p>
                )}
                {item.passiveDesc && (
                  <p className="text-[11px] text-white/60 leading-snug">{item.passiveDesc}</p>
                )}
              </div>
            ) : (
              "Empty slot"
            )
          }
        >
          <button
            onClick={() => setOpen(true)}
            className={`group relative flex items-center justify-center overflow-hidden rounded-xl border border-forge-border bg-forge-bg transition-colors hover:border-forge-gold/50 ${compact ? "h-12 w-12" : "h-20 w-20"}`}
          >
            {item ? (
              <>
                <Image
                  src={cdnUrl("items", item.imageFile)}
                  alt={item.name}
                  fill
                  className="object-contain p-1"
                  unoptimized
                />
                <div
                  role="button"
                  aria-label="Remove item"
                  onClick={(e) => {
                    e.stopPropagation();
                    setItem(index, null);
                  }}
                  className="absolute right-0.5 top-0.5 hidden rounded-full bg-black/70 p-0.5 group-hover:flex cursor-pointer"
                >
                  <X className="h-3 w-3 text-white" />
                </div>
              </>
            ) : (
              <Plus className={`text-white/20 group-hover:text-forge-gold/50 transition-colors ${compact ? "h-4 w-4" : "h-6 w-6"}`} />
            )}
          </button>
        </Tooltip>
      </TooltipProvider>
      <ItemPickerSheet
        items={items}
        slotIndex={index}
        open={open}
        onOpenChange={setOpen}
      />
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Build Suggestions Panel
// ---------------------------------------------------------------------------

/** Colour accent per tab */
const TAB_ACCENT: Partial<Record<BuildTab, string>> = {
  Popular:        "text-amber-400 border-amber-400",
  "Top Rated":    "text-sky-400 border-sky-400",
  Crit:           "text-red-400 border-red-400",
  "Attack Speed": "text-lime-400 border-lime-400",
  "Full Damage":  "text-orange-400 border-orange-400",
  Magic:          "text-purple-400 border-purple-400",
  Tank:           "text-cyan-400 border-cyan-400",
  Utility:        "text-teal-400 border-teal-400",
  Lifesteal:      "text-rose-400 border-rose-400",
  Poke:           "text-yellow-400 border-yellow-400",
};

function BuildSuggestionsPanel({ allItems }: { allItems: ItemOption[] }) {
  const hero = useForgeStore((s) => s.hero);
  const loadedBuilds = useForgeStore((s) => s.loadedBuilds);
  const setLoadedBuilds = useForgeStore((s) => s.setLoadedBuilds);
  const applyBuild = useForgeStore((s) => s.applyBuild);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<BuildTab>("Popular");

  useEffect(() => {
    if (!hero) {
      setLoadedBuilds([]);
      return;
    }
    setLoading(true);
    fetchHeroBuilds(hero.id)
      .then(setLoadedBuilds)
      .catch(() => setLoadedBuilds([]))
      .finally(() => setLoading(false));
  }, [hero?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!hero) return null;

  // Which tabs actually have builds (plus always show Popular / Top Rated)
  const activeTabs = BUILD_TABS.filter((tab) => {
    if (tab === "Popular" || tab === "Top Rated") return true;
    return loadedBuilds.some((b) => b.tags.includes(tab));
  });

  // Filter + sort builds for the active tab
  const visibleBuilds: BuildSuggestion[] = (() => {
    if (activeTab === "Popular") {
      return [...loadedBuilds].sort((a, b) => b.upvotes - a.upvotes);
    }
    if (activeTab === "Top Rated") {
      return [...loadedBuilds].sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes));
    }
    return loadedBuilds.filter((b) => b.tags.includes(activeTab));
  })();

  const accent = TAB_ACCENT[activeTab] ?? "text-forge-gold border-forge-gold";

  return (
    <div className="w-full max-w-sm">
      <p className="mb-3 font-cinzel text-sm uppercase tracking-widest text-white/40">
        Suggested Builds
      </p>

      {/* Tab strip */}
      <div className="mb-3 flex gap-1 overflow-x-auto pb-1 scrollbar-none">
        {activeTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`shrink-0 rounded border px-2.5 py-0.5 text-[11px] font-semibold transition-colors whitespace-nowrap ${
              activeTab === tab
                ? `${TAB_ACCENT[tab] ?? "text-forge-gold border-forge-gold"} bg-white/5`
                : "border-forge-border text-white/40 hover:text-white/70"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {loading && (
          <p className="text-[11px] text-white/30 text-center py-2">Loading builds…</p>
        )}
        {!loading && visibleBuilds.length === 0 && (
          <p className="text-[11px] text-white/20 text-center py-3">
            {activeTab === "Popular" || activeTab === "Top Rated"
              ? `No community builds yet for ${hero.name}.`
              : `No ${activeTab} builds for ${hero.name} yet.`}
          </p>
        )}
        {visibleBuilds.map((build) => (
          <div
            key={build.id}
            className="rounded-lg border border-forge-border bg-forge-surface/60 px-3 py-2.5"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white/80 truncate">{build.title}</p>
                {/* Archetype tags */}
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {build.tags.map((tag) => (
                    <span
                      key={tag}
                      className={`text-[9px] font-semibold border rounded px-1.5 py-px ${
                        TAB_ACCENT[tag] ?? "text-white/40 border-white/20"
                      }`}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                {build.upvotes > 0 && (
                  <span className="text-[10px] text-forge-gold/70">▲ {build.upvotes}</span>
                )}
                <button
                  onClick={() => applyBuild(build)}
                  className="flex items-center gap-1 rounded border border-forge-gold/50 bg-forge-gold/10 px-2 py-0.5 text-[11px] text-forge-gold hover:bg-forge-gold/20 transition-colors"
                >
                  <Zap className="h-3 w-3" />
                  Apply
                </button>
              </div>
            </div>

            {/* Item + spell + emblem preview */}
            <div className="flex gap-1.5 flex-wrap items-center">
              {build.items
                .sort((a, b) => a.slot - b.slot)
                .map((bi) => (
                  <TooltipProvider key={bi.slot}>
                    <Tooltip content={bi.item.name}>
                      <div className="relative h-8 w-8 overflow-hidden rounded-md border border-forge-border">
                        <Image
                          src={cdnUrl("items", bi.item.imageFile)}
                          alt={bi.item.name}
                          fill
                          className="object-contain"
                          unoptimized
                        />
                      </div>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              {build.spell && (
                <>
                  <span className="text-white/20 text-xs">+</span>
                  <TooltipProvider>
                    <Tooltip content={build.spell.name}>
                      <div className="relative h-8 w-8 overflow-hidden rounded-md border border-forge-border/50">
                        <Image
                          src={cdnUrl("spells", build.spell.imageFile)}
                          alt={build.spell.name}
                          fill
                          className="object-contain"
                          unoptimized
                        />
                      </div>
                    </Tooltip>
                  </TooltipProvider>
                </>
              )}
              {build.emblem && (
                <>
                  <span className="text-white/20 text-xs">+</span>
                  <TooltipProvider>
                    <Tooltip
                      content={
                        <div>
                          <p className="font-semibold">{build.emblem.name}</p>
                          {[build.talents.standard1, build.talents.standard2, build.talents.core]
                            .filter(Boolean)
                            .map((t) => (
                              <p key={t!.id} className="text-forge-gold/90 text-[11px] mt-0.5">
                                • {t!.name}
                              </p>
                            ))}
                        </div>
                      }
                    >
                      <div className="relative h-8 w-8 overflow-hidden rounded-md border border-forge-border/50">
                        <Image
                          src={cdnUrl("emblems", build.emblem.imageFile)}
                          alt={build.emblem.name}
                          fill
                          className="object-contain p-0.5"
                          unoptimized
                        />
                      </div>
                    </Tooltip>
                  </TooltipProvider>
                </>
              )}
              <span className="ml-auto text-[10px] text-white/20">Lv {build.heroLevel}</span>
            </div>

            {build.description && (
              <p className="mt-1.5 text-[10px] text-white/35 leading-relaxed line-clamp-2">
                {build.description}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline item picker (shown inside the expanded equipment toggle)
// ---------------------------------------------------------------------------

function InlineItemPicker({
  items,
  slotIndex,
  onPick,
}: {
  items: ItemOption[];
  slotIndex: number;
  onPick: () => void;
}) {
  const equipped = useForgeStore((s) => s.items);
  const setItem = useForgeStore((s) => s.setItem);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [statTag, setStatTag] = useState<string | null>(null);

  const equippedSlugs = new Set(equipped.filter(Boolean).map((i) => i!.slug));
  const tagDef = statTag ? STAT_TAGS.find((t) => t.label === statTag) : null;

  const filtered = items.filter((item) => {
    if (query && !item.name.toLowerCase().includes(query.toLowerCase())) return false;
    if (category !== "All" && item.category !== category.toUpperCase()) return false;
    if (tagDef && !tagDef.keys.some((k) => (item.stats as Record<string, number | undefined>)[k])) return false;
    return true;
  });

  function pick(item: ItemOption) {
    setItem(slotIndex, item);
    onPick();
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <p className="text-[10px] text-white/40 uppercase tracking-wider">Slot {slotIndex + 1}</p>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
        <input
          autoFocus
          className="w-full rounded border border-forge-border bg-forge-bg py-1.5 pl-9 pr-3 text-sm text-white placeholder:text-white/30 focus:border-forge-gold focus:outline-none"
          placeholder="Search items…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`rounded-sm px-2 py-0.5 text-xs font-medium transition-colors ${
              category === c ? "bg-forge-gold text-forge-bg" : "text-white/50 hover:text-white"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Stat filter tags */}
      <div className="flex flex-wrap gap-1">
        {STAT_TAGS.map((t) => (
          <button
            key={t.label}
            onClick={() => setStatTag(statTag === t.label ? null : t.label)}
            className={`rounded-sm border px-2 py-0.5 text-[11px] font-medium transition-colors ${
              statTag === t.label
                ? "border-forge-gold bg-forge-gold/15 text-forge-gold"
                : "border-forge-border text-white/40 hover:text-white/70 hover:border-white/30"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Item list */}
      <div className="max-h-64 overflow-y-auto overscroll-contain pr-1">
        <div className="flex flex-col gap-1">
          {filtered.map((item) => {
            const isEquipped = equippedSlugs.has(item.slug);
            const statEntries = Object.entries(item.stats).filter(([, v]) => v);
            return (
              <button
                key={item.slug}
                onClick={() => pick(item)}
                disabled={isEquipped}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                  isEquipped
                    ? "border-forge-gold/30 bg-forge-gold/5 opacity-60 cursor-not-allowed"
                    : "border-forge-border hover:border-forge-gold/50 hover:bg-white/5"
                }`}
              >
                <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md">
                  <Image src={cdnUrl("items", item.imageFile)} alt={item.name} fill className="object-contain" unoptimized />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium text-white">{item.name}</p>
                    {item.goldCost > 0 && <span className="shrink-0 text-xs text-forge-gold">{item.goldCost}g</span>}
                  </div>
                  {statEntries.length > 0 && (
                    <p className="mt-0.5 truncate text-[11px] text-white/50">
                      {statEntries.slice(0, 4).map(([k, v]) => fmtStat(k, v as number)).filter(Boolean).join("  ·  ")}
                    </p>
                  )}
                  {item.passiveName && (
                    <p className="mt-0.5 truncate text-[11px] text-forge-gold/80 italic">{item.passiveName}</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported sections
// ---------------------------------------------------------------------------

export function EquipmentSection({ items }: { items: ItemOption[] }) {
  const equipped = useForgeStore((s) => s.items);
  const setItem = useForgeStore((s) => s.setItem);
  const moveItem = useForgeStore((s) => s.moveItem);
  const [expanded, setExpanded] = useState(false);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);

  // Drag-and-drop state — just track which slot is being dragged
  const dragSlot = React.useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const filledSlots = equipped.filter(Boolean);

  function handleSlotClick(i: number) {
    if (!expanded) setExpanded(true);
    setActiveSlot(activeSlot === i ? null : i);
  }

  return (
    <div>
      {/* Compact summary row */}
      <div className="flex items-center gap-1.5">
        {equipped.map((item, i) => (
          <TooltipProvider key={i} delayDuration={100}>
            <Tooltip
              content={item ? (
                <div className="max-w-[200px]">
                  <p className="font-semibold text-forge-gold">{item.name}</p>
                  {item.goldCost > 0 && <p className="text-[11px] text-forge-gold/70">{item.goldCost}g</p>}
                  <ItemStatLines stats={item.stats} />
                  {item.passiveName && (
                    <p className="mt-1.5 text-[11px] font-semibold text-white/80">{item.passiveName}</p>
                  )}
                  {item.passiveDesc && (
                    <p className="text-[11px] text-white/60 leading-snug">{item.passiveDesc}</p>
                  )}
                </div>
              ) : "Empty slot"}
            >
              <button
                onClick={() => handleSlotClick(i)}
                draggable={!!item}
                onDragStart={(e) => {
                  dragSlot.current = i;
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => { dragSlot.current = null; setDragOver(null); }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOver(i); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragSlot.current !== null && dragSlot.current !== i) {
                    moveItem(dragSlot.current, i);
                    // Keep expanded state and switch focus to dropped slot
                    setActiveSlot(i);
                  }
                  setDragOver(null);
                }}
                className={`relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border transition-colors ${
                  dragOver === i
                    ? "border-forge-gold scale-110 bg-forge-gold/20"
                    : expanded && activeSlot === i
                    ? "border-forge-gold bg-forge-gold/10"
                    : item
                    ? "border-forge-gold/40"
                    : "border-forge-border hover:border-forge-gold/30"
                } bg-forge-bg ${item ? "cursor-grab active:cursor-grabbing" : ""}`}
              >
                {item ? (
                  <Image src={cdnUrl("items", item.imageFile)} alt={item.name} fill className="object-contain p-0.5" unoptimized />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[9px] text-white/20">{i + 1}</div>
                )}
                {item && (
                  <div
                    role="button"
                    aria-label="Remove item"
                    onClick={(e) => { e.stopPropagation(); setItem(i, null); if (activeSlot === i) setActiveSlot(null); }}
                    className="absolute right-0.5 top-0.5 hidden rounded-full bg-black/70 p-0.5 group-hover:flex cursor-pointer"
                  >
                    <X className="h-2.5 w-2.5 text-white" />
                  </div>
                )}
              </button>
            </Tooltip>
          </TooltipProvider>
        ))}

        {/* Gold total */}
        {filledSlots.length > 0 && (
          <span className="ml-1 text-[10px] text-forge-gold/60">
            {filledSlots.reduce((s, it) => s + (it?.goldCost ?? 0), 0).toLocaleString()}g
          </span>
        )}

        {/* Expand toggle */}
        <button
          onClick={() => { setExpanded(!expanded); setActiveSlot(null); }}
          className="ml-auto text-[10px] text-white/30 hover:text-white/60 transition-colors px-1"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? "▲" : "▼"}
        </button>
      </div>

      {/* Expandable inline picker */}
      {expanded && (
        <div className="mt-2 border-t border-forge-border pt-2">
          {activeSlot !== null ? (
            <InlineItemPicker
              items={items}
              slotIndex={activeSlot}
              onPick={() => setActiveSlot(null)}
            />
          ) : (
            <p className="text-[11px] text-white/25 text-center py-3">Tap a slot to pick an item</p>
          )}
        </div>
      )}
    </div>
  );
}

export function BuildSuggestionsSection({ items }: { items: ItemOption[] }) {
  return <BuildSuggestionsPanel allItems={items} />;
}

export function CenterPane({ items }: { items: ItemOption[] }) {
  const equipped = useForgeStore((s) => s.items);

  return (
    <main className="flex flex-1 flex-col items-center gap-8 overflow-y-auto px-4 py-6 md:px-6 md:py-8">
      <div>
        <p className="mb-4 text-center font-cinzel text-sm uppercase tracking-widest text-white/40">
          Equipment
        </p>
        <div className="grid grid-cols-3 gap-3">
          {equipped.map((item, i) => (
            <ItemSlot key={i} index={i} item={item} items={items} />
          ))}
        </div>
      </div>

      <BuildSuggestionsPanel allItems={items} />
    </main>
  );
}
