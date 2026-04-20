"use client";

import Image from "next/image";
import React, { useEffect, useState } from "react";
import { Search, X, Plus, Zap, ThumbsUp, ThumbsDown, Share2, Check, Trash2, BookmarkPlus, BookmarkCheck } from "lucide-react";
import { useSession } from "next-auth/react";
import { useForgeStore, type ItemOption, type EmblemOption, type EmblemNode, type SpellOption } from "@/lib/store";
import type { ItemStats } from "@/lib/calc";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cdnUrl } from "@/lib/utils";
import { fetchHeroBuilds, fetchHeroSkillsWithScalings, fetchExternalBuilds, publishBuild, voteBuild, fetchMyBuildsForHero, deleteBuild, cloneBuild, type BuildSuggestion, type SkillWithScalings, type ExternalBuildRecord } from "@/lib/actions";
import { BUILD_TABS, type BuildTab } from "@/lib/build-config";
import { calcSkillDamage } from "@/lib/calc";
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

function ItemStatLines({ stats }: { stats: ItemStats }) {
  const statsAsMap = stats as Record<string, number | undefined>;
  const lines = STAT_LABELS
    .map(({ key }) => {
      const v = statsAsMap[key] ?? 0;
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

/** Reusable icon helper for external image URLs (mlbb.gg / OpenMLBB CDN) */
function ExtIcon({ src, label, round }: { src: string; label: string; round?: boolean }) {
  return (
    <TooltipProvider>
      <Tooltip content={label}>
        <div className={`relative h-8 w-8 shrink-0 overflow-hidden border border-white/10 bg-white/5 ${round ? "rounded-full" : "rounded-md"}`}>
          <Image src={src} alt={label} fill className="object-contain" unoptimized />
        </div>
      </Tooltip>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Default Builds Panel — mlbb.gg curated builds, standalone section
// ---------------------------------------------------------------------------

function DefaultBuildsPanel({ allItems, allEmblems, allSpells }: { allItems: ItemOption[]; allEmblems: EmblemOption[]; allSpells: SpellOption[] }) {
  const hero = useForgeStore((s) => s.hero);
  const [externalBuilds, setExternalBuilds] = useState<ExternalBuildRecord[]>([]);
  const [externalLoading, setExternalLoading] = useState(false);

  function resolveItem(slug: string): ItemOption | null {
    return allItems.find((i) => i.slug === slug) ?? null;
  }

  useEffect(() => {
    if (!hero) { setExternalBuilds([]); return; }
    setExternalLoading(true);
    fetchExternalBuilds(hero.name)
      .then(setExternalBuilds)
      .catch(() => setExternalBuilds([]))
      .finally(() => setExternalLoading(false));
  }, [hero?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!hero) return null;

  return (
    <div className="w-full">
      <p className="mb-3 font-cinzel text-sm uppercase tracking-widest text-white/40">
        Default Builds
      </p>

      {externalLoading && (
        <p className="text-[11px] text-white/30 text-center py-2">Loading…</p>
      )}
      {!externalLoading && externalBuilds.length === 0 && (
        <p className="text-[11px] text-white/20 text-center py-3">No default builds for {hero.name}.</p>
      )}

      <div className="space-y-2">
        {externalBuilds.map((build) => {
          const resolvedItems = build.equipSlugs
            .map((slug, i) => ({ slot: i + 1, item: resolveItem(slug) }))
            .filter((x): x is { slot: number; item: ItemOption } => x.item !== null);
          const talents = [build.talentStandard1, build.talentStandard2, build.talentCore].filter(Boolean);

          return (
            <div key={build.id} className="rounded-lg border border-sky-900/40 bg-sky-950/20 px-3 py-2">
              {/* Single row — title · icons · spell/emblem · apply */}
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-xs font-semibold text-white/80 truncate min-w-0 flex-1">{build.title}</p>

                {/* item icons */}
                <div className="flex gap-1 items-center shrink-0">
                  {resolvedItems.map(({ slot, item }) => (
                    <TooltipProvider key={slot}>
                      <Tooltip content={item.name}>
                        <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded border border-white/10 bg-white/5">
                          <Image src={cdnUrl("items", item.imageFile)} alt={item.name} fill className="object-contain" unoptimized />
                        </div>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                  {resolvedItems.length < build.equipSlugs.length && (
                    <span className="text-[10px] text-white/20">+{build.equipSlugs.length - resolvedItems.length}</span>
                  )}
                </div>

                {/* spell · emblem · talents */}
                {(build.spellImageUrl || build.emblem) && (
                  <div className="flex items-center gap-1 shrink-0">
                    <div className="h-5 w-px bg-white/10" />
                    {build.spellImageUrl && (
                      <ExtIcon src={build.spellImageUrl} label={build.spellName ?? "Spell"} round />
                    )}
                    {build.emblem && (
                      <ExtIcon src={build.emblem.imageUrl} label={build.emblem.name} round />
                    )}
                    {talents.map((t, ti) => t && (
                      <ExtIcon key={ti} src={t.imageUrl} label={t.name} round />
                    ))}
                  </div>
                )}

                {/* apply button */}
                {resolvedItems.length > 0 && (
                  <button
                    onClick={() => {
                      const s = useForgeStore.getState();
                      for (let i = 0; i < 6; i++) s.setItem(i, null);
                      for (const { slot, item } of resolvedItems) s.setItem(slot - 1, item);
                      if (build.spellName) {
                        const spell = allSpells.find(
                          (sp) => sp.name.toLowerCase() === build.spellName!.toLowerCase()
                        ) ?? null;
                        s.setSpell(spell);
                      }
                      if (build.emblem) {
                        const raw = build.emblem.name.replace(/ emblem$/i, "").trim().toLowerCase();
                        const emblemOpt = allEmblems.find((e) => {
                          const local = e.name.toLowerCase();
                          return local === raw || local === `custom ${raw}` || local.endsWith(raw);
                        }) ?? null;
                        s.setEmblem(emblemOpt);
                        const allNodes = allEmblems.flatMap((e) => e.nodes);
                        const findNode = (talentName: string): EmblemNode | null =>
                          allNodes.find((n) => n.name.toLowerCase() === talentName.toLowerCase()) ?? null;
                        s.setTalent("standard1", build.talentStandard1 ? findNode(build.talentStandard1.name) : null);
                        s.setTalent("standard2", build.talentStandard2 ? findNode(build.talentStandard2.name) : null);
                        s.setTalent("core", build.talentCore ? findNode(build.talentCore.name) : null);
                      }
                    }}
                    className="flex shrink-0 items-center gap-1 rounded border border-sky-600/50 bg-sky-900/30 px-2 py-0.5 text-[11px] text-sky-300 hover:bg-sky-900/50 transition-colors"
                  >
                    <Zap className="h-3 w-3" />
                    Apply
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {externalBuilds.length > 0 && (
         <p className="mt-2 text-center text-[10px] text-white/20">
           Curated builds via <span className="text-sky-400/60">mlbb.</span>
         </p>
        
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Suggested Builds Panel — Popular / Top Rated / archetypes / User Created
// ---------------------------------------------------------------------------

function BuildSuggestionsPanel({ allItems, allEmblems, allSpells }: { allItems: ItemOption[]; allEmblems: EmblemOption[]; allSpells: SpellOption[] }) {
  const hero = useForgeStore((s) => s.hero);
  const level = useForgeStore((s) => s.level);
  const storeItems = useForgeStore((s) => s.items);
  const storeSpell = useForgeStore((s) => s.spell);
  const storeEmblem = useForgeStore((s) => s.emblem);
  const storeTalents = useForgeStore((s) => s.talents);
  const loadedBuilds = useForgeStore((s) => s.loadedBuilds);
  const setLoadedBuilds = useForgeStore((s) => s.setLoadedBuilds);
  const applyBuild = useForgeStore((s) => s.applyBuild);
  const { data: session } = useSession();

  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<BuildTab | "User Created" | "My Builds">("Popular");
  const [publishTitle, setPublishTitle] = useState("");
  const [publishDesc, setPublishDesc] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);
  // Local vote state: buildId → { up, down, userVote }
  const [voteState, setVoteState] = useState<Record<string, { up: number; down: number; userVote: "up" | "down" | null }>>({});
  const [copiedBuildId, setCopiedBuildId] = useState<string | null>(null);
  // My Builds (personal garage)
  const [myBuilds, setMyBuilds] = useState<BuildSuggestion[]>([]);
  const [myBuildsLoading, setMyBuildsLoading] = useState(false);
  // Track which source build IDs the user has already cloned (maps source id → cloned id)
  const [savedMap, setSavedMap] = useState<Record<string, string>>({});
  const [savingBuildId, setSavingBuildId] = useState<string | null>(null);

  useEffect(() => {
    if (!hero) { setLoadedBuilds([]); return; }
    setLoading(true);
    fetchHeroBuilds(hero.id)
      .then((builds) => {
        setLoadedBuilds(builds);
        // Seed local vote display from DB counts (no per-user vote info yet)
        setVoteState((prev) => {
          const next = { ...prev };
          for (const b of builds) {
            if (!next[b.id]) next[b.id] = { up: b.upvotes, down: b.downvotes, userVote: null };
          }
          return next;
        });
      })
      .catch(() => setLoadedBuilds([]))
      .finally(() => setLoading(false));
  }, [hero?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load personal garage builds when user logs in or hero changes
  useEffect(() => {
    if (!hero || !session?.user) { setMyBuilds([]); return; }
    setMyBuildsLoading(true);
    fetchMyBuildsForHero(hero.id)
      .then(setMyBuilds)
      .catch(() => setMyBuilds([]))
      .finally(() => setMyBuildsLoading(false));
  }, [hero?.id, session?.user?.email]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!hero) return null;

  // Which tabs to show — archetype tabs only if there are matching builds
  const activeTabs: (BuildTab | "User Created" | "My Builds")[] = [
    ...BUILD_TABS.filter((tab) => {
      if (tab === "Popular" || tab === "Top Rated") return true;
      return loadedBuilds.some((b) => b.tags.includes(tab));
    }),
    "User Created",
    "My Builds",
  ];

  const userBuilds = loadedBuilds.filter((b) => b.authorName !== null);

  const visibleBuilds: BuildSuggestion[] = (() => {
    if (activeTab === "User Created") return [...userBuilds].sort((a, b) => b.upvotes - a.upvotes);
    if (activeTab === "My Builds") return myBuilds;
    if (activeTab === "Popular") return [...loadedBuilds].sort((a, b) => b.upvotes - a.upvotes);
    if (activeTab === "Top Rated") return [...loadedBuilds].sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes));
    return loadedBuilds.filter((b) => b.tags.includes(activeTab as BuildTab));
  })();

  async function handlePublish() {
    if (!hero || !publishTitle.trim()) return;
    setPublishing(true);
    setPublishError(null);
    setPublishSuccess(false);
    const result = await publishBuild({
      heroId: hero.id,
      title: publishTitle.trim(),
      description: publishDesc.trim() || undefined,
      heroLevel: level,
      itemSlugs: storeItems.map((i) => i?.slug ?? null),
      spellSlug: storeSpell?.slug ?? null,
      emblemSlug: storeEmblem?.slug ?? null,
      emblemNodeIds: [storeTalents.standard1?.id, storeTalents.standard2?.id, storeTalents.core?.id].filter(Boolean) as string[],
    });
    setPublishing(false);
    if (result.ok) {
      setPublishTitle("");
      setPublishDesc("");
      setPublishSuccess(true);
      setPublishedSlug(result.slug ?? null);
      fetchHeroBuilds(hero.id).then(setLoadedBuilds).catch(() => {});
    } else {
      setPublishError(result.error ?? "Failed to publish");
    }
  }

  async function handleDelete(buildId: string) {
    const result = await deleteBuild(buildId);
    if (result.ok) {
      setMyBuilds((prev) => prev.filter((b) => b.id !== buildId));
      setLoadedBuilds(loadedBuilds.filter((b) => b.id !== buildId));
      // Remove from savedMap if this was a clone
      setSavedMap((prev) => {
        const next = { ...prev };
        for (const [srcId, clonedId] of Object.entries(next)) {
          if (clonedId === buildId) delete next[srcId];
        }
        return next;
      });
    }
  }

  async function handleClone(sourceBuildId: string) {
    if (!session?.user) return;
    setSavingBuildId(sourceBuildId);
    const result = await cloneBuild(sourceBuildId);
    setSavingBuildId(null);
    if (result.ok && result.build) {
      setMyBuilds((prev) => [result.build!, ...prev]);
      setSavedMap((prev) => ({ ...prev, [sourceBuildId]: result.build!.id }));
    }
  }

  async function handleRemoveSaved(sourceBuildId: string) {
    const clonedId = savedMap[sourceBuildId];
    if (!clonedId) return;
    const result = await deleteBuild(clonedId);
    if (result.ok) {
      setMyBuilds((prev) => prev.filter((b) => b.id !== clonedId));
      setSavedMap((prev) => { const next = { ...prev }; delete next[sourceBuildId]; return next; });
    }
  }

  async function handleVote(buildId: string, direction: "up" | "down") {    const cur = voteState[buildId] ?? { up: 0, down: 0, userVote: null };
    // Optimistic update
    let newUp = cur.up, newDown = cur.down, newVote: "up" | "down" | null;
    if (cur.userVote === direction) {
      // Toggle off
      newUp   = direction === "up"   ? cur.up - 1   : cur.up;
      newDown = direction === "down" ? cur.down - 1 : cur.down;
      newVote = null;
    } else {
      newUp   = direction === "up"   ? cur.up + 1   : (cur.userVote === "up"   ? cur.up - 1   : cur.up);
      newDown = direction === "down" ? cur.down + 1 : (cur.userVote === "down" ? cur.down - 1 : cur.down);
      newVote = direction;
    }
    setVoteState((prev) => ({ ...prev, [buildId]: { up: newUp, down: newDown, userVote: newVote } }));
    const result = await voteBuild(buildId, direction);
    if (result.ok && result.upvotes !== undefined) {
      setVoteState((prev) => ({
        ...prev,
        [buildId]: { up: result.upvotes!, down: result.downvotes!, userVote: result.userVote ?? null },
      }));
    } else {
      // Roll back optimistic update on error
      setVoteState((prev) => ({ ...prev, [buildId]: cur }));
    }
  }

  return (
    <div className="w-full">
      <p className="mb-3 font-cinzel text-sm uppercase tracking-widest text-white/40">
        Suggested Builds
      </p>

      {/* Tab strip */}
      <div className="mb-3 flex gap-1 overflow-x-auto pb-1 scrollbar-none">
        {activeTabs.map((tab) => {
          const tabAccent = tab === "User Created"
            ? "text-violet-400 border-violet-400"
            : tab === "My Builds"
            ? "text-amber-400 border-amber-400"
            : (TAB_ACCENT[tab as BuildTab] ?? "text-forge-gold border-forge-gold");
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 rounded border px-2.5 py-0.5 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                activeTab === tab
                  ? `${tabAccent} bg-white/5`
                  : "border-forge-border text-white/40 hover:text-white/70"
              }`}
            >
              {tab}
              {tab === "User Created" && userBuilds.length > 0 && (
                <span className="ml-1 text-[9px] opacity-60">{userBuilds.length}</span>
              )}
              {tab === "My Builds" && myBuilds.length > 0 && (
                <span className="ml-1 text-[9px] opacity-60">{myBuilds.length}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        {loading && (
          <p className="text-[11px] text-white/30 text-center py-2">Loading builds…</p>
        )}

        {/* User Created tab */}
        {!loading && activeTab === "User Created" && (
          <>
            {/* Publish form */}
            {session?.user ? (
              <div className="rounded-lg border border-violet-900/50 bg-violet-950/20 px-3 py-2.5 space-y-2">
                <p className="text-[11px] font-semibold text-violet-300">Publish current build</p>

                {/* Current build preview — items + spell + emblem + talents */}
                <div className="flex flex-wrap gap-1 items-center rounded border border-white/5 bg-black/20 px-2 py-2">
                  {storeItems.map((item, i) => item ? (
                    <TooltipProvider key={i}>
                      <Tooltip content={item.name}>
                        <div className="relative h-7 w-7 overflow-hidden rounded border border-forge-border/60">
                          <Image src={cdnUrl("items", item.imageFile)} alt={item.name} fill className="object-contain" unoptimized />
                        </div>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <div key={i} className="h-7 w-7 rounded border border-forge-border/30 bg-white/5" />
                  ))}
                  {storeSpell && (
                    <>
                      <span className="text-white/20 text-xs">+</span>
                      <TooltipProvider>
                        <Tooltip content={storeSpell.name}>
                          <div className="relative h-7 w-7 overflow-hidden rounded-full border border-forge-border/60">
                            <Image src={cdnUrl("spells", storeSpell.imageFile)} alt={storeSpell.name} fill className="object-contain" unoptimized />
                          </div>
                        </Tooltip>
                      </TooltipProvider>
                    </>
                  )}
                  {storeEmblem && (
                    <>
                      <span className="text-white/20 text-xs">+</span>
                      <TooltipProvider>
                        <Tooltip content={storeEmblem.name}>
                          <div className="relative h-7 w-7 overflow-hidden rounded border border-forge-border/60">
                            <Image src={cdnUrl("emblems", storeEmblem.imageFile)} alt={storeEmblem.name} fill className="object-contain p-0.5" unoptimized />
                          </div>
                        </Tooltip>
                      </TooltipProvider>
                      {[storeTalents.standard1, storeTalents.standard2, storeTalents.core].filter(Boolean).map((t) => (
                        <TooltipProvider key={t!.id}>
                          <Tooltip content={t!.name}>
                            <div className="relative h-7 w-7 overflow-hidden rounded-full border border-forge-border/60 bg-white/5">
                              <Image src={cdnUrl("talents", t!.imageFile)} alt={t!.name} fill className="object-contain" unoptimized />
                            </div>
                          </Tooltip>
                        </TooltipProvider>
                      ))}
                    </>
                  )}
                  {storeItems.every((i) => !i) && !storeSpell && !storeEmblem && (
                    <span className="text-[11px] text-white/20">No items equipped yet.</span>
                  )}
                </div>

                <input
                  type="text"
                  value={publishTitle}
                  onChange={(e) => { setPublishTitle(e.target.value); setPublishSuccess(false); }}
                  placeholder="Build title (required)"
                  maxLength={80}
                  className="w-full rounded border border-forge-border bg-forge-bg px-2.5 py-1.5 text-[12px] text-white placeholder:text-white/25 focus:border-violet-500 focus:outline-none"
                />
                <textarea
                  value={publishDesc}
                  onChange={(e) => setPublishDesc(e.target.value)}
                  placeholder="Description (optional)"
                  maxLength={300}
                  rows={2}
                  className="w-full resize-none rounded border border-forge-border bg-forge-bg px-2.5 py-1.5 text-[12px] text-white placeholder:text-white/25 focus:border-violet-500 focus:outline-none"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px]">
                    {publishError && <span className="text-red-400">{publishError}</span>}
                    {publishSuccess && !publishedSlug && <span className="text-emerald-400">Published!</span>}
                    {publishSuccess && publishedSlug && (
                      <button
                        onClick={() => {
                          const url = `${window.location.origin}/share/${publishedSlug}`;
                          navigator.clipboard.writeText(url);
                          setCopiedBuildId("publish");
                          setTimeout(() => setCopiedBuildId(null), 2000);
                        }}
                        className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors"
                      >
                        {copiedBuildId === "publish" ? <Check className="h-3 w-3" /> : <Share2 className="h-3 w-3" />}
                        {copiedBuildId === "publish" ? "Copied!" : "Copy share link"}
                      </button>
                    )}
                  </span>
                  <button
                    onClick={handlePublish}
                    disabled={!publishTitle.trim() || publishing}
                    className="flex shrink-0 items-center gap-1 rounded border border-violet-600/60 bg-violet-900/40 px-3 py-1 text-[11px] font-semibold text-violet-200 hover:bg-violet-900/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {publishing ? "Publishing…" : "Publish"}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-white/20 text-center py-2">
                Sign in to publish builds.
              </p>
            )}

            {!loading && visibleBuilds.length === 0 && (
              <p className="text-[11px] text-white/20 text-center py-2">
                No community builds yet for {hero.name}.
              </p>
            )}
          </>
        )}

        {/* My Builds tab */}
        {activeTab === "My Builds" && (
          <>
            {!session?.user ? (
              <p className="text-[11px] text-white/20 text-center py-3">Sign in to view your builds.</p>
            ) : myBuildsLoading ? (
              <p className="text-[11px] text-white/30 text-center py-2">Loading…</p>
            ) : myBuilds.length === 0 ? (
              <p className="text-[11px] text-white/20 text-center py-3">
                You haven&apos;t published any builds for {hero.name} yet.
              </p>
            ) : null}
          </>
        )}

        {/* DB builds — all tabs except User Created / My Builds */}
        {!loading && activeTab !== "User Created" && activeTab !== "My Builds" && visibleBuilds.length === 0 && (
          <p className="text-[11px] text-white/20 text-center py-3">
            {activeTab === "Popular" || activeTab === "Top Rated"
              ? `No builds yet for ${hero.name}.`
              : `No ${activeTab} builds for ${hero.name} yet.`}
          </p>
        )}

        {visibleBuilds.map((build) => {
          const vs = voteState[build.id] ?? { up: build.upvotes, down: build.downvotes, userVote: null };
          return (
          <div key={build.id} className="rounded-lg border border-forge-border bg-forge-surface/60 px-3 py-2.5">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white/80 truncate">{build.title}</p>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {build.authorName && (
                    <span className="text-[9px] border border-violet-700/40 rounded px-1.5 py-px text-violet-400/70">
                      {build.authorName}
                    </span>
                  )}
                  {build.tags.map((tag) => (
                    <span
                      key={tag}
                      className={`text-[9px] font-semibold border rounded px-1.5 py-px ${
                        (TAB_ACCENT as Record<string, string | undefined>)[tag] ?? "text-white/40 border-white/20"
                      }`}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                {/* Vote buttons */}
                <button
                  onClick={() => handleVote(build.id, "up")}
                  disabled={!session?.user}
                  title={session?.user ? "Upvote" : "Sign in to vote"}
                  className={`flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] transition-colors disabled:opacity-30 disabled:cursor-default ${
                    vs.userVote === "up"
                      ? "text-emerald-400 bg-emerald-900/30 border border-emerald-700/50"
                      : "text-white/40 hover:text-emerald-400 border border-transparent hover:border-emerald-700/40"
                  }`}
                >
                  <ThumbsUp className="h-3 w-3" />
                  {vs.up > 0 && <span>{vs.up}</span>}
                </button>
                <button
                  onClick={() => handleVote(build.id, "down")}
                  disabled={!session?.user}
                  title={session?.user ? "Downvote" : "Sign in to vote"}
                  className={`flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] transition-colors disabled:opacity-30 disabled:cursor-default ${
                    vs.userVote === "down"
                      ? "text-red-400 bg-red-900/30 border border-red-700/50"
                      : "text-white/40 hover:text-red-400 border border-transparent hover:border-red-700/40"
                  }`}
                >
                  <ThumbsDown className="h-3 w-3" />
                  {vs.down > 0 && <span>{vs.down}</span>}
                </button>
                <button
                  onClick={() => {
                    const url = `${window.location.origin}/share/${build.slug}`;
                    navigator.clipboard.writeText(url).catch(() => {});
                    setCopiedBuildId(build.id);
                    setTimeout(() => setCopiedBuildId((cur) => cur === build.id ? null : cur), 2000);
                  }}
                  title="Copy share link"
                  className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] border border-transparent text-white/40 hover:text-white/70 hover:border-white/20 transition-colors"
                >
                  {copiedBuildId === build.id ? <Check className="h-3 w-3 text-emerald-400" /> : <Share2 className="h-3 w-3" />}
                </button>
                <button
                  onClick={() => applyBuild(build)}
                  className="flex items-center gap-1 rounded border border-forge-gold/50 bg-forge-gold/10 px-2 py-0.5 text-[11px] text-forge-gold hover:bg-forge-gold/20 transition-colors"
                >
                  <Zap className="h-3 w-3" />
                  Apply
                </button>
                {/* Save to My Builds — shown on community tabs when logged in */}
                {session?.user && activeTab !== "My Builds" && (
                  savedMap[build.id] ? (
                    <button
                      onClick={() => handleRemoveSaved(build.id)}
                      title="Remove from My Builds"
                      className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] border border-amber-700/50 text-amber-400 bg-amber-900/20 hover:bg-red-900/20 hover:text-red-400 hover:border-red-700/40 transition-colors"
                    >
                      <BookmarkCheck className="h-3 w-3" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleClone(build.id)}
                      disabled={savingBuildId === build.id}
                      title="Save to My Builds"
                      className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] border border-transparent text-white/30 hover:text-amber-400 hover:border-amber-700/40 transition-colors disabled:opacity-40"
                    >
                      <BookmarkPlus className="h-3 w-3" />
                    </button>
                  )
                )}
                {/* Delete — shown on My Builds tab */}
                {activeTab === "My Builds" && (
                  <button
                    onClick={() => handleDelete(build.id)}
                    title="Delete build"
                    className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] border border-transparent text-white/30 hover:text-red-400 hover:border-red-700/40 transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex gap-1.5 flex-wrap items-center">
              {build.items.sort((a, b) => a.slot - b.slot).map((bi) => (
                <TooltipProvider key={bi.slot}>
                  <Tooltip content={bi.item.name}>
                    <div className="relative h-8 w-8 overflow-hidden rounded-md border border-forge-border">
                      <Image src={cdnUrl("items", bi.item.imageFile)} alt={bi.item.name} fill className="object-contain" unoptimized />
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
                        <Image src={cdnUrl("spells", build.spell.imageFile)} alt={build.spell.name} fill className="object-contain" unoptimized />
                      </div>
                    </Tooltip>
                  </TooltipProvider>
                </>
              )}
              {build.emblem && (
                <>
                  <span className="text-white/20 text-xs">+</span>
                  <TooltipProvider>
                    <Tooltip content={build.emblem.name}>
                      <div className="relative h-8 w-8 overflow-hidden rounded-md border border-forge-border/50">
                        <Image src={cdnUrl("emblems", build.emblem.imageFile)} alt={build.emblem.name} fill className="object-contain p-0.5" unoptimized />
                      </div>
                    </Tooltip>
                  </TooltipProvider>
                  {[build.talents.standard1, build.talents.standard2, build.talents.core].filter(Boolean).map((t) => (
                    <TooltipProvider key={t!.id}>
                      <Tooltip content={t!.name}>
                        <div className="relative h-8 w-8 overflow-hidden rounded-full border border-forge-border/50 bg-white/5">
                          <Image src={cdnUrl("talents", t!.imageFile)} alt={t!.name} fill className="object-contain" unoptimized />
                        </div>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                </>
              )}
              <span className="ml-auto text-[10px] text-white/20">Lv {build.heroLevel}</span>
            </div>
            {build.description && (
              <p className="mt-1.5 text-[10px] text-white/35 leading-relaxed line-clamp-2">{build.description}</p>
            )}
          </div>
          );
        })}
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
// Synergy & Anti-Synergy Warnings
// ---------------------------------------------------------------------------

interface BuildWarning {
  level: "error" | "warn" | "info";
  message: string;
}

function computeBuildWarnings(equipped: (ItemOption | null)[]): BuildWarning[] {
  const warnings: BuildWarning[] = [];
  const slugs = equipped.filter(Boolean).map((i) => i!.slug);

  if (slugs.length === 0) return warnings;

  // --- Anti-synergy: Golden Staff + any crit damage item ---
  const hasGoldenStaff = slugs.includes("golden-staff");
  const hasBerserkersFury = slugs.includes("berserkers-fury");
  if (hasGoldenStaff && hasBerserkersFury) {
    warnings.push({
      level: "error",
      message: "Golden Staff + Berserker's Fury: All crit rate is converted to attack speed — BF's Doom passive (crit damage) is completely wasted.",
    });
  }

  // --- Anti-synergy: duplicate "Unique" passive items ---
  const UNIQUE_PASSIVE_GROUPS: { passive: string; label: string; slugs: string[] }[] = [
    { passive: "Fortress Shield", label: "Fortress Shield", slugs: ["dominance-ice", "black-ice-shield"] },
    { passive: "Burning Soul",    label: "Burning Soul",    slugs: ["cursed-helmet", "molten-essence"] },
    { passive: "Deter",           label: "Deter",           slugs: ["antique-cuirass", "dreadnaught-armor"] },
    { passive: "Armor Buster",    label: "Armor Buster",    slugs: ["malefic-gun", "malefic-roar"] },
  ];
  for (const group of UNIQUE_PASSIVE_GROUPS) {
    const equipped_in_group = group.slugs.filter((s) => slugs.includes(s));
    if (equipped_in_group.length >= 2) {
      const names = equipped.filter((i) => i && group.slugs.includes(i.slug)).map((i) => i!.name);
      warnings.push({
        level: "warn",
        message: `Unique Passive "${group.passive}": ${names.join(" + ")} share the same unique passive — only one takes effect.`,
      });
    }
  }

  // --- Multiple boots ---
  const BOOTS_SLUGS = new Set([
    "boots", "warrior-boots", "tough-boots", "swift-boots",
    "magic-boots", "arcane-boots", "rapid-boots", "demon-boots",
    "rapid-boots-conceal",
  ]);
  const bootCount = slugs.filter((s) => BOOTS_SLUGS.has(s) || s.includes("boots")).length;
  if (bootCount >= 2) {
    warnings.push({
      level: "warn",
      message: `Multiple boots equipped (${bootCount}) — only one pair of boots is recommended.`,
    });
  }

  // --- Positive synergy: Golden Staff + Feather of Heaven ---
  if (hasGoldenStaff && slugs.includes("feather-of-heaven")) {
    warnings.push({
      level: "info",
      message: "Golden Staff + Feather of Heaven: attack speed cap raised to 5.00/s — both items amplify attack speed scaling.",
    });
  }

  // --- Positive synergy: Holy Crystal + Blood Wings ---
  if (slugs.includes("holy-crystal") && slugs.includes("blood-wings")) {
    warnings.push({
      level: "info",
      message: "Holy Crystal + Blood Wings: Holy Crystal's Magic Power boost increases Blood Wings' Guard shield.",
    });
  }

  return warnings;
}

function SynergyWarnings() {
  const equipped = useForgeStore((s) => s.items);
  const warnings = computeBuildWarnings(equipped);
  if (warnings.length === 0) return null;

  const colours = {
    error: { border: "border-red-700/40", bg: "bg-red-950/30", icon: "⛔", text: "text-red-300/90" },
    warn:  { border: "border-yellow-700/40", bg: "bg-yellow-950/30", icon: "⚠️", text: "text-yellow-300/90" },
    info:  { border: "border-emerald-700/40", bg: "bg-emerald-950/30", icon: "✦", text: "text-emerald-300/90" },
  };

  return (
    <div className="mt-2 space-y-1.5">
      {warnings.map((w, i) => {
        const c = colours[w.level];
        return (
          <div key={i} className={`flex items-start gap-2 rounded-lg border ${c.border} ${c.bg} px-2.5 py-2 text-[11px]`}>
            <span className="mt-px shrink-0">{c.icon}</span>
            <span className={c.text}>{w.message}</span>
          </div>
        );
      })}
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

      {/* Synergy / anti-synergy warnings */}
      <SynergyWarnings />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skill Damage Breakdown
// ---------------------------------------------------------------------------

const SLOT_ORDER = ["S1", "S2", "S3", "S4", "PASSIVE"] as const;
const SLOT_LABEL: Record<string, string> = {
  PASSIVE: "Passive",
  S1: "Skill 1",
  S2: "Skill 2",
  S3: "Skill 3",
  S4: "Ultimate",
};

function SkillDamagePanel() {
  const hero       = useForgeStore((s) => s.hero);
  const finalStats = useForgeStore((s) => s.finalStats);

  const [skills, setSkills]           = useState<SkillWithScalings[]>([]);
  const [loading, setLoading]         = useState(false);
  const [skillLevels, setSkillLevels] = useState<Record<string, number>>({});
  const [targetArmor, setTargetArmor]   = useState(80);
  const [targetMagRes, setTargetMagRes] = useState(50);

  useEffect(() => {
    if (!hero) { setSkills([]); return; }
    setLoading(true);
    fetchHeroSkillsWithScalings(hero.id)
      .then((data) => {
        setSkills(data);
        const defaults: Record<string, number> = {};
        for (const sk of data) {
          if (sk.scalings.length) defaults[sk.id] = sk.scalings[sk.scalings.length - 1].level;
        }
        setSkillLevels(defaults);
      })
      .catch(() => setSkills([]))
      .finally(() => setLoading(false));
  }, [hero?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!hero) return null;
  if (loading) return (
    <div>
      <p className="mb-3 font-cinzel text-sm uppercase tracking-widest text-white/40">Skill Damage</p>
      <p className="py-2 text-center text-[11px] text-white/30">Loading…</p>
    </div>
  );

  const skillsWithData = skills.filter((sk) => sk.scalings.length > 0);
  if (!skillsWithData.length) return null;

  return (
    <div>
      <p className="mb-3 font-cinzel text-sm uppercase tracking-widest text-white/40">Skill Damage</p>

      {/* Target config */}
      <div className="mb-3 flex items-center gap-4 text-[11px] text-white/40">
        <span>vs</span>
        <label className="flex items-center gap-1.5">
          Armor
          <input
            type="number" min={0} value={targetArmor}
            onChange={(e) => setTargetArmor(Math.max(0, +e.target.value))}
            className="w-14 rounded border border-forge-border bg-forge-bg px-1.5 py-0.5 text-center text-[11px] text-white/70 focus:border-forge-gold focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-1.5">
          Mag Res
          <input
            type="number" min={0} value={targetMagRes}
            onChange={(e) => setTargetMagRes(Math.max(0, +e.target.value))}
            className="w-14 rounded border border-forge-border bg-forge-bg px-1.5 py-0.5 text-center text-[11px] text-white/70 focus:border-forge-gold focus:outline-none"
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        {SLOT_ORDER.map((slot) => {
          const skill = skills.find((sk) => sk.slot === slot);
          if (!skill || !skill.scalings.length) return null;

          const selectedLevel = skillLevels[skill.id] ?? skill.scalings[skill.scalings.length - 1].level;
          const scaling = skill.scalings.find((sc) => sc.level === selectedLevel) ?? skill.scalings[skill.scalings.length - 1];
          const dmg = calcSkillDamage(scaling, finalStats, targetArmor, targetMagRes);
          const hasDamage = dmg.rawPhys > 0 || dmg.rawMag > 0;

          return (
            <div key={skill.id} className="rounded-lg border border-forge-border bg-forge-surface/60 px-3 py-2.5">
              <div className="flex items-start gap-3">
                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-forge-border/50">
                  <Image src={cdnUrl("skills", skill.imageFile)} alt={skill.name} fill className="object-contain" unoptimized />
                </div>

                <div className="min-w-0 flex-1">
                  {/* Header */}
                  <div className="mb-1.5 flex items-baseline gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-white/30">{SLOT_LABEL[slot]}</span>
                    <span className="truncate text-xs font-semibold text-white/80">{skill.name}</span>
                  </div>

                  {/* Level selector + meta */}
                  <div className="mb-2 flex flex-wrap items-center gap-1">
                    {skill.scalings.map((sc) => (
                      <button
                        key={sc.level}
                        onClick={() => setSkillLevels((prev) => ({ ...prev, [skill.id]: sc.level }))}
                        className={`h-5 min-w-[1.25rem] rounded px-1 text-[10px] font-semibold transition-colors ${
                          selectedLevel === sc.level
                            ? "bg-forge-gold text-forge-bg"
                            : "border border-forge-border text-white/30 hover:text-white/60"
                        }`}
                      >
                        {sc.level}
                      </button>
                    ))}
                    <div className="ml-auto flex items-center gap-2">
                      {dmg.cooldown != null && (
                        <span className="text-[10px] text-white/30">{dmg.cooldown}s</span>
                      )}
                      {dmg.manaCost != null && dmg.manaCost > 0 && (
                        <span className="text-[10px] text-blue-400/50">{dmg.manaCost} mana</span>
                      )}
                    </div>
                  </div>

                  {/* Damage output */}
                  {hasDamage ? (
                    <div className="flex flex-wrap gap-x-5 gap-y-0.5">
                      {dmg.rawPhys > 0 && (
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-[10px] text-white/25">Phys</span>
                          <span className="text-xs text-orange-300/80">{dmg.rawPhys}</span>
                          <span className="text-[10px] text-white/15">→</span>
                          <span className="text-xs font-bold text-orange-400">{dmg.dealtPhys}</span>
                        </div>
                      )}
                      {dmg.rawMag > 0 && (
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-[10px] text-white/25">Mag</span>
                          <span className="text-xs text-purple-300/80">{dmg.rawMag}</span>
                          <span className="text-[10px] text-white/15">→</span>
                          <span className="text-xs font-bold text-purple-400">{dmg.dealtMag}</span>
                        </div>
                      )}
                      {dmg.rawPhys > 0 && dmg.rawMag > 0 && (
                        <div className="flex items-baseline gap-1">
                          <span className="text-[10px] text-white/25">Total</span>
                          <span className="text-xs font-bold text-forge-gold">{dmg.total}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-[10px] italic text-white/20">No damage scaling</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SkillDamageSection() {
  return <SkillDamagePanel />;
}

// ---------------------------------------------------------------------------
// Combat Conditions — toggleable situational item passives
// ---------------------------------------------------------------------------
function CombatConditionsPanel() {
  const items = useForgeStore((s) => s.items);
  const { bodActive, warAxeStacks } = useForgeStore((s) => s.itemConditions);
  const setItemCondition = useForgeStore((s) => s.setItemCondition);
  const finalStats = useForgeStore((s) => s.finalStats);

  const hasBoD      = items.some((i) => i?.slug === "blade-of-despair");
  const hasWarAxe   = items.some((i) => i?.slug === "war-axe");
  const hasHolyCrystal = items.some((i) => i?.slug === "holy-crystal");
  const hasBloodWings  = items.some((i) => i?.slug === "blood-wings");

  if (!hasBoD && !hasWarAxe && !hasHolyCrystal && !hasBloodWings) return null;

  return (
    <section className="rounded-xl border border-forge-border bg-forge-surface/80 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">
        Item Passives
      </h3>
      <div className="space-y-2.5">
        {/* Blade of Despair — toggle */}
        {hasBoD && (
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-forge-border bg-forge-bg/60 px-3 py-2.5 transition-colors hover:border-amber-700/50">
            <input
              type="checkbox"
              checked={bodActive}
              onChange={(e) => setItemCondition("bodActive", e.target.checked)}
              className="h-4 w-4 shrink-0 accent-amber-400"
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-white/90">Blade of Despair — Despair</p>
              <p className="text-xs text-white/40">Target &lt; 50% HP · +25% Physical Attack</p>
            </div>
            {bodActive && (
              <span className="ml-auto shrink-0 rounded bg-amber-900/40 px-2 py-0.5 text-xs font-semibold text-amber-300">
                +{Math.round(finalStats.physAtk * 0.2)} ATK
              </span>
            )}
          </label>
        )}

        {/* War Axe — stack slider */}
        {hasWarAxe && (
          <div className="rounded-lg border border-forge-border bg-forge-bg/60 px-3 py-2.5">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white/90">War Axe — Fighting Spirit</p>
                <p className="text-xs text-white/40">+12 Phys ATK per stack</p>
              </div>
              <span className={`rounded px-2 py-0.5 text-sm font-bold ${warAxeStacks === 6 ? "bg-amber-900/40 text-amber-300" : "text-white/60"}`}>
                {warAxeStacks}/6
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={6}
              value={warAxeStacks}
              onChange={(e) => setItemCondition("warAxeStacks", Number(e.target.value))}
              className="w-full accent-amber-400"
            />
            {warAxeStacks === 6 && (
              <p className="mt-1.5 text-xs text-amber-400">⚡ Full stacks: +10% True Damage bonus active</p>
            )}
          </div>
        )}

        {/* Holy Crystal — informational (always active) */}
        {hasHolyCrystal && finalStats.holyXtalBoost > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-purple-800/30 bg-purple-950/20 px-3 py-2.5">
            <span className="text-purple-400">✦</span>
            <div>
              <p className="text-sm font-medium text-white/90">Holy Crystal — Mystery</p>
              <p className="text-xs text-white/40">+{finalStats.holyXtalBoost}% Magic Power (scales with level)</p>
            </div>
          </div>
        )}

        {/* Blood Wings — informational (always active) */}
        {hasBloodWings && finalStats.bloodWingsShield > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-blue-800/30 bg-blue-950/20 px-3 py-2.5">
            <span className="text-blue-400">🛡</span>
            <div>
              <p className="text-sm font-medium text-white/90">Blood Wings — Guard</p>
              <p className="text-xs text-white/40">Shield: {finalStats.bloodWingsShield.toLocaleString()} HP (800 + Magic Power)</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function CombatConditionsSection() {
  return <CombatConditionsPanel />;
}

export function BuildSuggestionsSection({ items, emblems, spells }: { items: ItemOption[]; emblems: EmblemOption[]; spells: SpellOption[] }) {
  return (
    <div className="space-y-6">
      <DefaultBuildsPanel allItems={items} allEmblems={emblems} allSpells={spells} />
      <BuildSuggestionsPanel allItems={items} allEmblems={emblems} allSpells={spells} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skill Info Section (used in Info tab)
// ---------------------------------------------------------------------------

import { fetchHeroGuide, fetchHeroCombos, type HeroGuideData, type SkillCombo } from "@/lib/actions";

const SLOT_COLOR: Record<string, string> = {
  PASSIVE: "bg-white/10 text-white/50",
  S1:      "bg-sky-900/60 text-sky-300",
  S2:      "bg-sky-900/60 text-sky-300",
  S3:      "bg-sky-900/60 text-sky-300",
  S4:      "bg-amber-900/60 text-amber-300",
};
const PRIORITY_COLOR: Record<string, string> = {
  ULT: "border-amber-600/60 bg-amber-900/30 text-amber-300",
  S1:  "border-sky-700/60 bg-sky-900/30 text-sky-300",
  S2:  "border-sky-700/60 bg-sky-900/30 text-sky-300",
  S3:  "border-sky-700/60 bg-sky-900/30 text-sky-300",
};

function SkillInfoPanel() {
  const hero        = useForgeStore((s) => s.hero);
  const loadedSkills = useForgeStore((s) => s.loadedSkills);
  const [guide, setGuide]               = useState<HeroGuideData | null>(null);
  const [combos, setCombos]             = useState<SkillCombo[]>([]);
  const [combosLoading, setCombosLoading] = useState(false);
  const [expanded, setExpanded]         = useState<string | null>(null);

  useEffect(() => {
    if (!hero) { setGuide(null); return; }
    fetchHeroGuide(hero.slug).then(setGuide).catch(() => setGuide(null));
  }, [hero?.slug]);

  useEffect(() => {
    if (!hero) { setCombos([]); return; }
    setCombosLoading(true);
    fetchHeroCombos(hero.slug)
      .then(setCombos)
      .catch(() => setCombos([]))
      .finally(() => setCombosLoading(false));
  }, [hero?.slug]);

  if (!hero || loadedSkills.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-white/20">Select a hero to view skills.</div>
    );
  }

  // Strip wiki markup and HTML color tags from description
  const cleanDesc = (desc: string) =>
    desc
      .replace(/<font[^>]*>/gi, "").replace(/<\/font>/gi, "")
      .replace(/<[^>]*>/g, "")
      .replace(/\{\{[^}]+\}\}/g, "")
      .replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, "$2")
      .replace(/\s+/g, " ").trim();

  return (
    <div className="space-y-4">

      {/* Skill Priority */}
      {guide?.prioritySlots && guide.prioritySlots.length > 0 && (
        <section>
          <h3 className="mb-2 text-[11px] uppercase tracking-widest text-white/30 font-semibold">Skill Priority</h3>
          <div className="flex items-center gap-1.5 flex-wrap">
            {guide.prioritySlots.map((slot, i) => (
              <React.Fragment key={i}>
                <span className={`rounded border px-2.5 py-0.5 text-xs font-semibold ${PRIORITY_COLOR[slot] ?? "border-white/10 text-white/40"}`}>
                  {slot}
                </span>
                {i < guide.prioritySlots.length - 1 && (
                  <span className="text-white/20 text-xs">›</span>
                )}
              </React.Fragment>
            ))}
          </div>
        </section>
      )}

      {/* Skill cards */}
      <section className="space-y-2">
        <h3 className="mb-2 text-[11px] uppercase tracking-widest text-white/30 font-semibold">Skills</h3>
        {loadedSkills.map((skill) => {
          const isOpen = expanded === skill.id;
          const slotLabel = SLOT_LABEL[skill.slot] ?? skill.slot;
          const slotClass = SLOT_COLOR[skill.slot] ?? "bg-white/10 text-white/50";
          return (
            <div
              key={skill.id}
              className="rounded-lg border border-forge-border bg-forge-surface overflow-hidden"
            >
              {/* Collapsed header — always visible */}
              <button
                onClick={() => setExpanded(isOpen ? null : skill.id)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5 transition-colors"
              >
                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-white/10">
                  <Image
                    src={cdnUrl("skills", skill.imageFile)}
                    alt={skill.name}
                    fill
                    className="object-cover"
                    unoptimized
                    onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0"; }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`rounded px-1.5 py-px text-[9px] font-semibold uppercase ${slotClass}`}>
                      {slotLabel}
                    </span>
                    <span className="text-sm font-semibold text-white/85 truncate">{skill.name}</span>
                  </div>
                  {!isOpen && (
                    <p className="mt-0.5 text-[11px] text-white/35 line-clamp-1">{cleanDesc(skill.description)}</p>
                  )}
                </div>
                <span className="shrink-0 text-white/20 text-xs">{isOpen ? "▲" : "▼"}</span>
              </button>

              {/* Expanded description */}
              {isOpen && (
                <div className="px-3 pb-3 pt-1 border-t border-forge-border/60">
                  <p className="text-xs text-white/60 leading-relaxed">{cleanDesc(skill.description)}</p>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* Skill Combos */}
      {combosLoading && (
        <section>
          <h3 className="mb-2 text-[11px] uppercase tracking-widest text-white/30 font-semibold">Skill Combos</h3>
          <div className="text-xs text-white/25 py-2">Loading combos…</div>
        </section>
      )}
      {!combosLoading && combos.length > 0 && (
        <section className="space-y-2">
          <h3 className="mb-2 text-[11px] uppercase tracking-widest text-white/30 font-semibold">Skill Combos</h3>
          {combos.map((combo, ci) => (
            <div key={ci} className="rounded-lg border border-forge-border bg-forge-surface p-3 space-y-2">
              {/* Type badge */}
              <span className={`inline-block rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                combo.type === "TEAMFIGHT"
                  ? "border-red-800/50 bg-red-900/30 text-red-300"
                  : "border-blue-800/50 bg-blue-900/30 text-blue-300"
              }`}>
                {combo.type === "TEAMFIGHT" ? "Teamfight" : "Laning"}
              </span>
              {/* Icon sequence */}
              {combo.iconUrls.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  {combo.iconUrls.map((url, ii) => (
                    <React.Fragment key={ii}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt="skill icon"
                        className="h-8 w-8 rounded border border-white/10 object-cover bg-white/5"
                      />
                      {ii < combo.iconUrls.length - 1 && (
                        <span className="text-white/25 text-[10px]">›</span>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              )}
              {/* Description */}
              {combo.description && (
                <p className="text-xs text-white/55 leading-relaxed">{combo.description}</p>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

export function SkillInfoSection() {
  return <SkillInfoPanel />;
}


