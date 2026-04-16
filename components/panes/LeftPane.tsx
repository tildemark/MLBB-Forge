"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Search, X } from "lucide-react";
import { useForgeStore, type HeroOption, type EmblemOption, type SpellOption } from "@/lib/store";
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

          {/* Role filter */}
          <div className="mb-1 flex flex-wrap gap-1">
            {ROLES.map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(roleFilter === r ? null : r)}
                className={`rounded px-2 py-0.5 text-xs font-semibold transition-colors ${
                  roleFilter === r
                    ? "bg-forge-gold text-black"
                    : "bg-forge-bg text-white/60 hover:text-white border border-forge-border"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          {/* Lane filter */}
          <div className="mb-1 flex flex-wrap gap-1">
            {LANES.map((l) => (
              <button
                key={l.value}
                onClick={() => setLaneFilter(laneFilter === l.value ? null : l.value)}
                className={`rounded px-2 py-0.5 text-xs transition-colors ${
                  laneFilter === l.value
                    ? "bg-forge-gold/20 text-forge-gold border border-forge-gold"
                    : "bg-forge-bg text-white/50 hover:text-white border border-forge-border"
                }`}
              >
                {l.label}
              </button>
            ))}
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
// Emblem picker
// ---------------------------------------------------------------------------

function EmblemPicker({ emblems }: { emblems: EmblemOption[] }) {
  const emblem = useForgeStore((s) => s.emblem);
  const setEmblem = useForgeStore((s) => s.setEmblem);

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
// LeftPane
// ---------------------------------------------------------------------------

export function LeftPane({
  heroes,
  emblems,
  spells,
}: {
  heroes: Array<HeroOption & { statsRecord: HeroBaseStats | null }>;
  emblems: EmblemOption[];
  spells: SpellOption[];
}) {
  const hero = useForgeStore((s) => s.hero);
  const heroStats = useForgeStore((s) => s.heroStats);
  const level = useForgeStore((s) => s.level);
  const setLevel = useForgeStore((s) => s.setLevel);
  const loadedSkills = useForgeStore((s) => s.loadedSkills);
  const activeSkillIds = useForgeStore((s) => s.activeSkillIds);
  const toggleSkill = useForgeStore((s) => s.toggleSkill);
  const handleLevelChange = useCallback(([v]: number[]) => setLevel(v), [setLevel]);

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r border-forge-border bg-forge-surface px-4 py-6">
      {/* Hero portrait + name */}
      <div className="flex items-center gap-3">
        <HeroPicker heroes={heroes} />
        <div className="min-w-0">
          {hero ? (
            <>
              <p className="truncate font-cinzel text-base text-forge-gold">{hero.name}</p>
              {hero.title && (
                <p className="truncate text-xs text-white/50">{hero.title}</p>
              )}
              <div className="mt-1 flex flex-wrap gap-1">
                {hero.role.map((r) => (
                  <span
                    key={r}
                    className="rounded-sm bg-forge-border px-1.5 py-0.5 text-[10px] font-semibold text-white/70 uppercase tracking-wide"
                  >
                    {r}
                  </span>
                ))}
              </div>
              {/* Meta row: atkType · dmgType · resource */}
              <div className="mt-1 flex flex-wrap items-center gap-x-1 text-[10px] text-white/40">
                {hero.atkType && <span>{hero.atkType}</span>}
                {hero.atkType && hero.dmgType && <span>·</span>}
                {hero.dmgType && <span>{hero.dmgType}</span>}
                {hero.resource && hero.resource !== "Mana" && hero.resource !== "None" && (
                  <><span>·</span><span>{hero.resource}</span></>
                )}
              </div>
              {/* Specialty */}
              {hero.specialty && (
                <div className="mt-0.5 text-[10px] text-white/30">
                  {hero.specialty}
                </div>
              )}
              {/* Lane */}
              {hero.lane && (
                <div className="mt-0.5 text-[10px] text-white/30">
                  📍 {hero.lane}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-white/30">No hero selected</p>
          )}
        </div>
      </div>

      {/* Level slider */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/40">Level</p>
          <span className="font-cinzel text-sm text-forge-gold">{level}</span>
        </div>
        <Slider
          min={1}
          max={15}
          step={1}
          value={[level]}
          onValueChange={handleLevelChange}
        />
        <div className="mt-1 flex justify-between text-[10px] text-white/20">
          <span>1</span>
          <span>15</span>
        </div>
        {/* Per-level growth reference */}
        {heroStats && (
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
            {[
              { label: "HP",       base: heroStats.baseHp,       growth: heroStats.hpGrowth },
              { label: "Phys ATK", base: heroStats.baseAtkPhys,  growth: heroStats.atkPhysGrowth },
              { label: "Armor",    base: heroStats.baseArmor,    growth: heroStats.armorGrowth },
              { label: "Mag RES",  base: heroStats.baseMagRes,   growth: heroStats.magResGrowth },
              { label: "ATK SPD",  base: heroStats.baseAttackSpd, growth: heroStats.atkSpdGrowth },
              ...(heroStats.baseMana > 0
                ? [{ label: "Mana", base: heroStats.baseMana, growth: heroStats.manaGrowth }]
                : []),
            ].map(({ label, base, growth }) => (
              <div key={label} className="flex justify-between text-white/40">
                <span>{label}</span>
                <span className="font-mono text-white/60">
                  {statAtLevel(base, growth, level)}
                  {growth > 0 && <span className="text-white/25"> +{growth}/lv</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Emblem picker */}
      <EmblemPicker emblems={emblems} />

      {/* Spell picker */}
      <SpellPicker spells={spells} />

      {/* Hero skills */}
      {loadedSkills.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">Abilities</p>
          <div className="flex flex-col gap-2">
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
                        className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 transition-colors text-left ${
                          isActive
                            ? "border-forge-gold bg-forge-gold/10"
                            : hasStats
                            ? "border-forge-border bg-black/20 hover:border-forge-gold/40 cursor-pointer"
                            : "border-forge-border bg-black/20 cursor-default"
                        }`}
                      >
                        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md border border-forge-border">
                          <Image
                            src={cdnUrl("skills", skill.imageFile)}
                            alt={skill.name}
                            fill
                            className="object-cover"
                            unoptimized
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center text-[8px] text-white/20 pointer-events-none">
                            {skill.slot === "PASSIVE" ? "P" : skill.slot}
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-white/80 truncate">{skill.name}</p>
                          <p className="text-[10px] text-white/30">{slotLabel}</p>
                          {isActive && hasStats && (
                            <p className="text-[9px] text-forge-gold/80 truncate mt-0.5">
                              {formatStatEffects(parsedStats)}
                            </p>
                          )}
                          {!isActive && hasStats && (
                            <p className="text-[9px] text-white/20 truncate mt-0.5">
                              click to activate buff
                            </p>
                          )}
                        </div>
                        {hasStats && (
                          <div className={`shrink-0 h-2 w-2 rounded-full ${isActive ? "bg-forge-gold" : "bg-white/20"}`} />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs text-xs">
                      <p className="font-semibold mb-1">{skill.name}</p>
                      <p className="text-white/70 leading-relaxed">{skill.description.replace(/\{\{[^}]+\}\}/g, "").replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, "$2").trim()}</p>
                      {hasStats && (
                        <p className="mt-1.5 text-forge-gold/90">
                          {formatStatEffects(parsedStats)}
                        </p>
                      )}
                    </TooltipContent>
                  </TooltipRoot>
                </TooltipProvider>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );
}
