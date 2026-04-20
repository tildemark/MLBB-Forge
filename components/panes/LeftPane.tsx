"use client";

import Image from "next/image";
import React, { useCallback, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Search, X } from "lucide-react";
import { useForgeStore, type HeroOption, type EmblemOption, type SpellOption, type EmblemNode } from "@/lib/store";
import type { HeroBaseStats } from "@/lib/calc";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipRoot, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cdnUrl } from "@/lib/utils";
import { fetchHeroSkills } from "@/lib/actions";
import { statAtLevel } from "@/lib/calc";
import { parseStatEffects, hasStatEffects, formatStatEffects } from "@/lib/stat-parser";

// ---------------------------------------------------------------------------
// Hero picker dialog
// ---------------------------------------------------------------------------

const ROLES = ["Tank", "Fighter", "Mage", "Assassin", "Marksman", "Support"] as const;
// Labels shown in UI → stored value in DB (wiki uses "EXP Lane", "Gold Lane", etc.)
const LANES: { label: string; value: string }[] = [
  { label: "Gold Lane", value: "Gold Lane" },
  { label: "EXP Lane",  value: "EXP Lane" },
  { label: "Mid Lane",  value: "Mid Lane" },
  { label: "Jungle",    value: "Jungle" },
  { label: "Roaming",   value: "Roaming" },
];

function HeroPicker({
  heroes,
}: {
  heroes: Array<HeroOption & { statsRecord: HeroBaseStats | null }>;
}) {
  const hero = useForgeStore((s) => s.hero);
  const setHero = useForgeStore((s) => s.setHero);
  const setLoadedSkills = useForgeStore((s) => s.setLoadedSkills);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [specialtyFilter, setSpecialtyFilter] = useState<string | null>(null);
  const [laneFilter, setLaneFilter] = useState<string | null>(null);

  const allSpecialties = Array.from(
    new Set(heroes.flatMap((h) => (h.specialty ? h.specialty.split("/").map((s) => s.trim()) : [])))
  ).sort();

  const filtered = heroes.filter((h) => {
    if (query && !h.name.toLowerCase().includes(query.toLowerCase())) return false;
    if (roleFilter && !h.role.some((r) => r.toLowerCase() === roleFilter.toLowerCase())) return false;
    if (specialtyFilter) {
      const heroSpecs = (h.specialty ?? "").split("/").map((s) => s.trim());
      if (!heroSpecs.includes(specialtyFilter)) return false;
    }
    if (laneFilter) {
      const heroLanes = (h.lane ?? "").split("/").map((s) => s.trim().toLowerCase());
      if (!heroLanes.includes(laneFilter.toLowerCase())) return false;
    }
    return true;
  });

  function pick(h: (typeof heroes)[0]) {
    if (h.statsRecord) setHero(h, h.statsRecord);
    else setHero(h, { baseHp: 0, hpGrowth: 0, baseMana: 0, manaGrowth: 0, baseAtkPhys: 0, atkPhysGrowth: 0, baseAtkMag: 0, atkMagGrowth: 0, baseArmor: 0, armorGrowth: 0, baseMagRes: 0, magResGrowth: 0, baseMoveSpeed: 0, baseAttackSpd: 0, atkSpdGrowth: 0, baseHpRegen: 0, baseManaRegen: 0 });
    fetchHeroSkills(h.id).then(setLoadedSkills).catch(() => setLoadedSkills([]));
    setOpen(false);
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-forge-border bg-forge-surface hover:border-forge-gold transition-colors">
          {hero ? (
            <Image
              src={cdnUrl("heroes", hero.imageFile)}
              alt={hero.name}
              fill
              className="object-cover"
              unoptimized
            />
          ) : (
            <span className="text-xs text-white/40 text-center px-2">Pick Hero</span>
          )}
        </button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />
        <DialogPrimitive.Content className="fixed inset-x-4 top-[10%] z-50 mx-auto max-w-2xl rounded-xl border border-forge-border bg-forge-surface p-4 shadow-2xl">
          <DialogPrimitive.Title className="mb-3 font-cinzel text-lg text-forge-gold">
            Select Hero
          </DialogPrimitive.Title>
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded p-1 opacity-70 hover:opacity-100">
            <X className="h-4 w-4 text-white" />
          </DialogPrimitive.Close>

          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input
              className="w-full rounded border border-forge-border bg-forge-bg py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/30 focus:border-forge-gold focus:outline-none"
              placeholder="Search heroes…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>

          {/* Role + Lane filter — single icon row */}
          <div className="mb-1 flex items-center gap-1">
            {ROLES.map((r) => {
              const active = roleFilter === r;
              const file = ROLE_CDN_FILE[r.toLowerCase()];
              return (
                <TooltipProvider key={r} delayDuration={100}>
                  <TooltipRoot>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setRoleFilter(active ? null : r)}
                        className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded transition-all ${
                          active
                            ? "ring-2 ring-forge-gold bg-forge-gold/10"
                            : "opacity-40 hover:opacity-80"
                        }`}
                      >
                        {file
                          ? <img src={cdnUrl("roles", file)} alt={r} className="h-5 w-5 object-contain" />
                          : <span className="text-[9px] font-bold text-white uppercase">{r.slice(0,2)}</span>
                        }
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs capitalize">{r}</TooltipContent>
                  </TooltipRoot>
                </TooltipProvider>
              );
            })}

            <span className="mx-1 h-4 w-px bg-white/10" />

            {LANES.map((l) => {
              const active = laneFilter === l.value;
              const file = LANE_CDN_FILE[l.value.toLowerCase()];
              return (
                <TooltipProvider key={l.value} delayDuration={100}>
                  <TooltipRoot>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setLaneFilter(active ? null : l.value)}
                        className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded transition-all ${
                          active
                            ? "ring-2 ring-forge-gold/70 bg-forge-gold/10"
                            : "opacity-40 hover:opacity-80"
                        }`}
                      >
                        {file
                          ? <img src={cdnUrl("lanes", file)} alt={l.label} className="h-6 w-6 object-contain" />
                          : <span className="text-[9px] font-bold text-white uppercase">{l.label.slice(0,2)}</span>
                        }
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">{l.label}</TooltipContent>
                  </TooltipRoot>
                </TooltipProvider>
              );
            })}
          </div>

          {/* Specialty filter */}
          <div className="mb-3 flex flex-wrap gap-1">
            {allSpecialties.map((s) => (
              <button
                key={s}
                onClick={() => setSpecialtyFilter(specialtyFilter === s ? null : s)}
                className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
                  specialtyFilter === s
                    ? "bg-forge-gold/20 text-forge-gold border border-forge-gold"
                    : "bg-forge-bg text-white/40 hover:text-white/70 border border-forge-border"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <ScrollArea className="h-64">
            <div className="grid grid-cols-6 gap-2 p-1 sm:grid-cols-8">
              {filtered.map((h) => (
                <button
                  key={h.slug}
                  onClick={() => pick(h)}
                  className={`group relative flex flex-col items-center gap-1 rounded-lg border p-1 transition-colors ${
                    hero?.slug === h.slug
                      ? "border-forge-gold bg-forge-gold/10"
                      : "border-transparent hover:border-forge-border"
                  }`}
                >
                  <div className="relative h-12 w-12 overflow-hidden rounded-md">
                    <Image
                      src={cdnUrl("heroes", h.imageFile)}
                      alt={h.name}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                  <span className="w-full truncate text-center text-[10px] text-white/70">
                    {h.name}
                  </span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ---------------------------------------------------------------------------
// Emblem talent node button
// ---------------------------------------------------------------------------

function TalentNodeBtn({
  node,
  selected,
  onSelect,
}: {
  node: EmblemNode;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <TooltipProvider key={node.id} delayDuration={100}>
      <TooltipRoot>
        <TooltipTrigger asChild>
          <button
            onClick={onSelect}
            className={`relative h-10 w-10 overflow-hidden rounded-md border transition-colors ${
              selected
                ? "border-forge-gold glow-gold bg-forge-gold/10"
                : "border-forge-border hover:border-forge-gold/50"
            }`}
          >
            <Image
              src={cdnUrl("talents", node.imageFile)}
              alt={node.name}
              fill
              className="object-contain p-0.5"
              unoptimized
              onError={(e) => {
                (e.target as HTMLImageElement).style.opacity = "0";
              }}
            />
            {selected && (
              <div className="absolute inset-0 flex items-end justify-center pb-0.5 pointer-events-none">
                <div className="h-1 w-1 rounded-full bg-forge-gold" />
              </div>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs text-xs">
          <p className="font-semibold">{node.name}</p>
          {node.statKey && node.statValue != null && (
            <p className="text-forge-gold/90 mt-0.5">+{node.statValue} {node.statKey}</p>
          )}
          {node.description && (
            <p className="text-white/70 mt-0.5 leading-relaxed">{node.description}</p>
          )}
        </TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Emblem picker (with inline talent tree)
// ---------------------------------------------------------------------------

function EmblemPicker({ emblems }: { emblems: EmblemOption[] }) {
  const emblem = useForgeStore((s) => s.emblem);
  const setEmblem = useForgeStore((s) => s.setEmblem);
  const talents = useForgeStore((s) => s.talents);
  const setTalent = useForgeStore((s) => s.setTalent);

  // Collect all nodes from all emblems, grouped by tier, then by source emblem.
  // This allows cross-emblem talent selection (e.g. Marksman emblem + Assassin talents).
  const byTier = (tier: number) =>
    emblems.flatMap((e) =>
      e.nodes
        .filter((n) => n.tier === tier)
        .map((n) => ({ ...n, emblemSlug: e.slug, emblemName: e.name }))
    );

  const allTier1 = byTier(1);
  const allTier2 = byTier(2);
  const allTier3 = byTier(3);

  const hasTalents = emblems.some((e) => e.nodes.length > 0);

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">Emblem</p>
      <div className="flex flex-wrap gap-2">
        {emblems.map((e) => (
          <TooltipProvider key={e.slug}>
            <Tooltip content={e.name}>
              <button
                onClick={() => setEmblem(emblem?.slug === e.slug ? null : e)}
                className={`relative h-10 w-10 overflow-hidden rounded-md border transition-colors ${
                  emblem?.slug === e.slug
                    ? "border-forge-gold glow-gold"
                    : "border-forge-border hover:border-forge-gold/50"
                }`}
              >
                <Image
                  src={cdnUrl("emblems", e.imageFile)}
                  alt={e.name}
                  fill
                  className="object-contain p-0.5"
                  unoptimized
                />
              </button>
            </Tooltip>
          </TooltipProvider>
        ))}
      </div>

      {/* Selected emblem base stats */}
      {emblem && emblem.attrs.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5">
          {emblem.attrs.map((a, i) => (
            <span key={i} className="text-[10px] text-white/40">
              +{a.value} {a.name}
            </span>
          ))}
        </div>
      )}

      {/* Talent selection — cross-emblem: all nodes from all trees, grouped by tier */}
      {hasTalents && (
        <div className="mt-3 space-y-3">
          {/* Tier 1 */}
          {allTier1.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] text-white/30 uppercase tracking-wider">Tier 1</p>
              <div className="flex gap-1.5 flex-wrap">
                {allTier1.map((n) => (
                  <TalentNodeBtn
                    key={n.id}
                    node={n}
                    selected={talents.standard1?.id === n.id}
                    onSelect={() =>
                      setTalent("standard1", talents.standard1?.id === n.id ? null : n)
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {/* Tier 2 */}
          {allTier2.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] text-white/30 uppercase tracking-wider">Tier 2</p>
              <div className="flex gap-1.5 flex-wrap">
                {allTier2.map((n) => (
                  <TalentNodeBtn
                    key={n.id}
                    node={n}
                    selected={talents.standard2?.id === n.id}
                    onSelect={() =>
                      setTalent("standard2", talents.standard2?.id === n.id ? null : n)
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {/* Tier 3 — core talents */}
          {allTier3.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] text-white/30 uppercase tracking-wider">Core Talent</p>
              <div className="flex gap-1.5 flex-wrap">
                {allTier3.map((n) => (
                  <TalentNodeBtn
                    key={n.id}
                    node={n}
                    selected={talents.core?.id === n.id}
                    onSelect={() =>
                      setTalent("core", talents.core?.id === n.id ? null : n)
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spell picker
// ---------------------------------------------------------------------------

function SpellPicker({ spells }: { spells: SpellOption[] }) {
  const spell = useForgeStore((s) => s.spell);
  const setSpell = useForgeStore((s) => s.setSpell);

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">
        Battle Spell
      </p>
      <div className="flex flex-wrap gap-2">
        {spells.map((s) => (
          <TooltipProvider key={s.slug}>
            <Tooltip content={<><p className="font-semibold">{s.name}</p><p className="mt-0.5 opacity-80">{s.description}</p></>}>
              <button
                onClick={() => setSpell(spell?.slug === s.slug ? null : s)}
                className={`relative h-10 w-10 overflow-hidden rounded-md border transition-colors ${
                  spell?.slug === s.slug
                    ? "border-forge-gold glow-gold"
                    : "border-forge-border hover:border-forge-gold/50"
                }`}
              >
                <Image
                  src={cdnUrl("spells", s.imageFile)}
                  alt={s.name}
                  fill
                  className="object-contain"
                  unoptimized
                />
              </button>
            </Tooltip>
          </TooltipProvider>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Role + lane icon helpers
// ---------------------------------------------------------------------------

// Moonton serves role icons as .png and lane icons as .svg via the official API
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

function RoleIcon({ role, size = 6 }: { role: string; size?: number }) {
  const file = ROLE_CDN_FILE[role.toLowerCase()];
  const dim = `h-${size} w-${size}`;
  if (!file) return (
    <span className="rounded-sm bg-forge-border px-1.5 py-0.5 text-[10px] font-semibold text-white/70 uppercase tracking-wide">
      {role}
    </span>
  );
  return (
    <TooltipProvider delayDuration={100}>
      <TooltipRoot>
        <TooltipTrigger asChild>
          <div className={`relative ${dim} shrink-0`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cdnUrl("roles", file)}
              alt={role}
              className="h-full w-full object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0"; }}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs capitalize">{role}</TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  );
}

function LaneIcon({ lane, size = 6 }: { lane: string; size?: number }) {
  const file = LANE_CDN_FILE[lane.toLowerCase()];
  const dim = `h-${size} w-${size}`;
  if (!file) return (
    <span className="rounded-sm bg-forge-border px-1.5 py-0.5 text-[10px] font-semibold text-white/70 uppercase tracking-wide">
      {lane}
    </span>
  );
  return (
    <TooltipProvider delayDuration={100}>
      <TooltipRoot>
        <TooltipTrigger asChild>
          <div className={`relative ${dim} shrink-0`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cdnUrl("lanes", file)}
              alt={lane}
              className="h-full w-full object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0"; }}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">{lane}</TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Winrate badge — fetches from our proxy route
// ---------------------------------------------------------------------------

function WinRateBadge({ heroName }: { heroName: string }) {
  const [stats, setStats] = React.useState<{ winRate: number | null; pickRate: number | null; banRate: number | null } | null>(null);

  React.useEffect(() => {
    if (!heroName) return;
    setStats(null);
    fetch(`/api/hero-stats/${encodeURIComponent(heroName)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setStats(d); })
      .catch(() => {});
  }, [heroName]);

  if (!stats?.winRate) return null;
  const wr = Math.round(stats.winRate * 100 * 10) / 10;
  const pr = stats.pickRate != null ? Math.round(stats.pickRate * 100 * 10) / 10 : null;
  const br = stats.banRate != null ? Math.round(stats.banRate * 100 * 10) / 10 : null;
  const color = wr >= 53 ? "text-green-400" : wr >= 49 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="flex flex-col gap-0 leading-tight shrink-0">
      <span className={`text-[11px] font-semibold ${color}`}>Win Rate: {wr}%</span>
      {pr != null && <span className="text-[11px] text-white/50">Pick Rate: {pr}%</span>}
      {br != null && <span className="text-[11px] text-white/50">Ban Rate: {br}%</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact emblem + talent + spell summary row (with expandable picker)
// ---------------------------------------------------------------------------

function PlaceholderSlot({ label }: { label: string }) {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-md border border-forge-border bg-forge-bg text-[9px] text-white/20">
      {label}
    </div>
  );
}

export function CompactBuildRow({
  emblems,
  spells,
}: {
  emblems: EmblemOption[];
  spells: SpellOption[];
}) {
  const emblem = useForgeStore((s) => s.emblem);
  const talents = useForgeStore((s) => s.talents);
  const spell = useForgeStore((s) => s.spell);
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      {/* Compact summary row */}
      <div className="flex items-center gap-1.5">
        {/* Emblem icon */}
        <TooltipProvider delayDuration={100}>
          <TooltipRoot>
            <TooltipTrigger asChild>
              <button
                onClick={() => setExpanded(!expanded)}
                className={`relative h-10 w-10 overflow-hidden rounded-md border transition-colors ${
                  emblem ? "border-forge-gold/60" : "border-forge-border hover:border-forge-gold/40"
                }`}
              >
                {emblem ? (
                  <Image src={cdnUrl("emblems", emblem.imageFile)} alt={emblem.name} fill className="object-contain p-0.5" unoptimized />
                ) : (
                  <PlaceholderSlot label="E" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">{emblem?.name ?? "No emblem"}</TooltipContent>
          </TooltipRoot>
        </TooltipProvider>

        {/* Talent icons (t1, t2, core) */}
        {(["standard1", "standard2", "core"] as const).map((slot) => {
          const node = talents[slot];
          return (
            <TooltipProvider key={slot} delayDuration={100}>
              <TooltipRoot>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setExpanded(!expanded)}
                    className={`relative h-10 w-10 overflow-hidden rounded-md border transition-colors ${
                      node ? "border-forge-gold/40" : "border-forge-border hover:border-forge-gold/30"
                    }`}
                  >
                    {node ? (
                      <Image src={cdnUrl("talents", node.imageFile)} alt={node.name} fill className="object-contain p-0.5" unoptimized />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[9px] text-white/20">—</div>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">{node?.name ?? "No talent"}</TooltipContent>
              </TooltipRoot>
            </TooltipProvider>
          );
        })}

        {/* Separator */}
        <span className="text-white/20">·</span>

        {/* Spell icon */}
        <TooltipProvider delayDuration={100}>
          <TooltipRoot>
            <TooltipTrigger asChild>
              <button
                onClick={() => setExpanded(!expanded)}
                className={`relative h-10 w-10 overflow-hidden rounded-md border transition-colors ${
                  spell ? "border-forge-gold/40" : "border-forge-border hover:border-forge-gold/30"
                }`}
              >
                {spell ? (
                  <Image src={cdnUrl("spells", spell.imageFile)} alt={spell.name} fill className="object-contain p-0.5" unoptimized />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[9px] text-white/20">S</div>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">{spell?.name ?? "No spell"}</TooltipContent>
          </TooltipRoot>
        </TooltipProvider>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="ml-auto text-[10px] text-white/30 hover:text-white/60 transition-colors px-1"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? "▲" : "▼"}
        </button>
      </div>

      {/* Expandable full pickers */}
      {expanded && (
        <div className="mt-3 space-y-4 border-t border-forge-border pt-3">
          <EmblemPicker emblems={emblems} />
          <SpellPicker spells={spells} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported sections
// ---------------------------------------------------------------------------

export function HeroSection({
  heroes,
}: {
  heroes: Array<HeroOption & { statsRecord: HeroBaseStats | null }>;
}) {
  const hero = useForgeStore((s) => s.hero);
  const level = useForgeStore((s) => s.level);
  const setLevel = useForgeStore((s) => s.setLevel);
  const handleLevelChange = useCallback(([v]: number[]) => setLevel(v), [setLevel]);

  return (
    <div className="flex flex-col gap-6">
      {/* Hero portrait + name */}
      <div className="flex items-center gap-4">
        <HeroPicker heroes={heroes} />
        <div className="min-w-0 flex-1">
          {hero ? (
            <>
              {/* Name row with win rate top-right */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-cinzel text-lg text-forge-gold">{hero.name}</p>
                  {hero.title && (
                    <p className="truncate text-xs text-white/50">{hero.title}</p>
                  )}
                </div>
                <WinRateBadge heroName={hero.name} />
              </div>

              {/* Role + lane icons — one row */}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {hero.role.map((r) => (
                  <RoleIcon key={r} role={r} size={8} />
                ))}
                {hero.lane && hero.role.length > 0 && (
                  <span className="text-white/20">·</span>
                )}
                {hero.lane && <LaneIcon lane={hero.lane} size={8} />}
              </div>

              {/* Attack type · damage type · resource */}
              <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[10px] text-white/40">
                {hero.atkType && <span>{hero.atkType}</span>}
                {hero.atkType && hero.dmgType && <span>·</span>}
                {hero.dmgType && <span>{hero.dmgType}</span>}
                {hero.resource && hero.resource !== "Mana" && hero.resource !== "None" && (
                  <><span>·</span><span>{hero.resource}</span></>
                )}
                {hero.specialty && <><span>·</span><span className="text-white/30">{hero.specialty}</span></>}
              </div>
            </>
          ) : (
            <p className="text-sm text-white/30">Select a hero to begin</p>
          )}
        </div>
      </div>

      {/* Abilities */}
      {hero && <SkillsSection />}

      {/* Level slider */}
      {hero && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/40">Level</p>
            <span className="font-cinzel text-sm text-forge-gold">{level}</span>
          </div>
          <Slider min={1} max={15} step={1} value={[level]} onValueChange={handleLevelChange} gradientProgress={(level - 1) / 14} />
          <div className="mt-1 flex justify-between text-[10px] text-white/20">
            <span>1</span>
            <span>15</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function SkillsSection() {
  const loadedSkills = useForgeStore((s) => s.loadedSkills);
  const activeSkillIds = useForgeStore((s) => s.activeSkillIds);
  const toggleSkill = useForgeStore((s) => s.toggleSkill);

  if (loadedSkills.length === 0) return null;

  return (
    <div className="flex gap-2">
      {loadedSkills.map((skill) => {
        const parsedStats = parseStatEffects(skill.description);
        const hasStats = hasStatEffects(parsedStats);
        const isActive = activeSkillIds.includes(skill.id);
        const slotLabel =
          skill.slot === "PASSIVE" ? "Passive"
          : skill.slot === "S4" ? "Ultimate"
          : `Skill ${skill.slot.slice(1)}`;
        return (
          <TooltipProvider key={skill.id} delayDuration={100}>
            <TooltipRoot>
              <TooltipTrigger asChild>
                <button
                  onClick={hasStats ? () => toggleSkill(skill.id) : undefined}
                  className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-md border transition-colors ${
                    isActive
                      ? "border-forge-gold bg-forge-gold/10"
                      : hasStats
                      ? "border-forge-border hover:border-forge-gold/40 cursor-pointer"
                      : "border-forge-border cursor-default"
                  }`}
                >
                  <Image
                    src={cdnUrl("skills", skill.imageFile)}
                    alt={skill.name}
                    fill
                    className="object-cover"
                    unoptimized
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  {/* Slot label badge */}
                  <div className="absolute bottom-0 left-0 right-0 flex justify-center bg-black/50 py-px pointer-events-none">
                    <span className="text-[8px] text-white/60 leading-none">
                      {skill.slot === "PASSIVE" ? "P" : skill.slot === "S4" ? "ULT" : skill.slot}
                    </span>
                  </div>
                  {/* Active indicator dot */}
                  {isActive && (
                    <div className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-forge-gold pointer-events-none" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                <p className="font-semibold">{skill.name}</p>
                <p className="text-white/50 text-[10px]">{slotLabel}</p>
                <p className="text-white/70 leading-relaxed mt-1">{skill.description.replace(/\{\{[^}]+\}\}/g, "").replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, "$2").trim()}</p>
                {hasStats && (
                  <p className="mt-1.5 text-forge-gold/90">{formatStatEffects(parsedStats)}</p>
                )}
                {hasStats && !isActive && (
                  <p className="mt-1 text-white/30 italic">Tap to toggle buff</p>
                )}
              </TooltipContent>
            </TooltipRoot>
          </TooltipProvider>
        );
      })}
    </div>
  );
}

export function EmblemSection({ emblems }: { emblems: EmblemOption[] }) {
  return <EmblemPicker emblems={emblems} />;
}

export function SpellSection({ spells }: { spells: SpellOption[] }) {
  return <SpellPicker spells={spells} />;
}
