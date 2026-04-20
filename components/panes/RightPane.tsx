"use client";

import React from "react";
import { useForgeStore, EMBLEM_ATTR_MAP } from "@/lib/store";
import type { ItemOption, EmblemOption, EmblemNode, SpellOption } from "@/lib/store";
import type { FinalStats, ItemStats } from "@/lib/calc";
import { statAtLevel } from "@/lib/calc";
import { parseStatEffects } from "@/lib/stat-parser";
import { cdnUrl } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Source breakdown helpers
// ---------------------------------------------------------------------------

interface SourceBonus { label: string; formatted: string; iconUrl?: string; }
type AnyStats = Partial<Record<keyof ItemStats, number>>;
interface StatSource { label: string; iconUrl?: string; stats: AnyStats; }

function buildSources(
  items: (ItemOption | null)[],
  emblem: EmblemOption | null,
  talents: { standard1: EmblemNode | null; standard2: EmblemNode | null; core: EmblemNode | null },
  spell: SpellOption | null,
  activeSkillIds: string[],
  loadedSkills: Array<{ id: string; slot: string; name: string; description: string; imageFile: string }>
): StatSource[] {
  const out: StatSource[] = [];

  for (const item of items) {
    if (item) out.push({ label: item.name, iconUrl: cdnUrl("items", item.imageFile), stats: item.stats as AnyStats });
  }

  if (emblem?.attrs?.length) {
    const s: AnyStats = {};
    for (const attr of emblem.attrs) {
      const k = EMBLEM_ATTR_MAP[attr.name.toLowerCase()];
      if (k) s[k] = (s[k] ?? 0) + attr.value;
    }
    if (Object.keys(s).length) out.push({ label: emblem.name, iconUrl: cdnUrl("emblems", emblem.imageFile), stats: s });
  }

  for (const node of [talents.standard1, talents.standard2, talents.core]) {
    if (!node) continue;
    const s: AnyStats = {};
    if (node.statKey && node.statValue != null) {
      const k = (EMBLEM_ATTR_MAP[node.statKey.toLowerCase()] ?? node.statKey) as keyof ItemStats;
      s[k] = node.statValue;
    } else if (node.description) {
      Object.assign(s, parseStatEffects(node.description));
    }
    if (Object.keys(s).length) out.push({ label: node.name, iconUrl: cdnUrl("talents", node.imageFile), stats: s });
  }

  if (spell?.description) {
    const s = parseStatEffects(spell.description) as AnyStats;
    if (Object.keys(s).length) out.push({ label: spell.name, iconUrl: cdnUrl("spells", spell.imageFile), stats: s });
  }

  for (const id of activeSkillIds) {
    const skill = loadedSkills.find((sk) => sk.id === id);
    if (!skill?.description) continue;
    const s = parseStatEffects(skill.description) as AnyStats;
    if (!Object.keys(s).length) continue;
    const slotLabel = skill.slot === "PASSIVE" ? "P" : skill.slot === "S4" ? "ULT" : skill.slot;
    out.push({ label: slotLabel, iconUrl: cdnUrl("skills", skill.imageFile), stats: s });
  }

  return out;
}

function getSources(
  sources: StatSource[],
  keys: (keyof ItemStats)[],
  fmt: (total: number) => string
): SourceBonus[] {
  return sources.flatMap((src) => {
    const total = keys.reduce((acc, k) => acc + (((src.stats[k] as number) ?? 0)), 0);
    return total ? [{ label: src.label, iconUrl: src.iconUrl, formatted: fmt(total) }] : [];
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Rotating palette: each distinct user action (level up, item, skill, emblem, spell)
 * advances to the next colour, so all stats that changed together share one colour
 * and differ from stats changed in previous actions.
 */
const ACTION_PALETTE = [
  "#d1d5db", // gray-300   — near-white (initial)
  "#86efac", // green-300
  "#34d399", // emerald-400
  "#67e8f9", // cyan-300
  "#93c5fd", // blue-300
  "#c4b5fd", // violet-300
  "#fbbf24", // amber-400
  "#e8c96a", // forge-gold-light
] as const;

function pct(val: number, decimals = 0) {
  return `${(val * 100).toFixed(decimals)}%`;
}

function num(val: number, decimals = 0) {
  return val.toFixed(decimals);
}

function StatRow({
  label,
  value,
  warn,
  sources,
  valueColor,
  breakdown,
}: {
  label: string;
  value: string;
  warn?: boolean;
  sources?: SourceBonus[];
  /** Colour to adopt (and flash to) the next time this row's value changes. */
  valueColor?: string;
  /** Optional [base +growth +items] breakdown shown dimly after the value */
  breakdown?: string;
}) {
  const prevValueRef = React.useRef<string>(value);
  // retainedColor: the colour this row has settled on after its last change
  const [retainedColor, setRetainedColor] = React.useState<string>("#d1d5db");
  const [flashKey, setFlashKey] = React.useState(0);

  React.useEffect(() => {
    if (prevValueRef.current !== value) {
      prevValueRef.current = value;
      // Adopt the current level colour only for rows whose value actually changed
      if (valueColor) setRetainedColor(valueColor);
      setFlashKey((k) => k + 1);
    }
  // valueColor intentionally excluded — level changes alone must not trigger flash
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const color = warn ? undefined : retainedColor;
  const spanStyle: React.CSSProperties = color
    ? ({ color, "--stat-end-color": color } as React.CSSProperties)
    : {};

  return (
    <div className="py-1 border-b border-white/5 last:border-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-white/50">{label}</span>
        <span className="flex items-baseline gap-1.5">
          <span
            key={flashKey}
            className={`text-sm font-medium tabular-nums ${
              warn ? "text-red-400" : ""
            }${flashKey > 0 ? " stat-flash" : ""}`}
            style={spanStyle}
          >
            {value}
          </span>
          {breakdown && (
            <span className="text-[10px] tabular-nums text-white/20">{breakdown}</span>
          )}
        </span>
      </div>
      {sources && sources.length > 0 && (
        <div className="mt-0.5 flex flex-wrap gap-1">
          {sources.map((s, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded bg-white/5 px-1 py-px">
              {s.iconUrl
                ? <img src={s.iconUrl} alt={s.label} title={s.label} className="h-4 w-4 rounded-sm object-cover flex-shrink-0" />
                : <span className="text-[9px] text-white/35">{s.label}</span>
              }
              <span className="text-[9px] text-forge-gold/65">{s.formatted}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function CapNotice({ label, wasted, cap }: { label: string; wasted: string; cap: string }) {
  return (
    <div className="mb-1 flex items-center gap-1.5 rounded bg-red-950/40 border border-red-800/30 px-2 py-1 text-[10px]">
      <span className="text-red-400">⚠</span>
      <span className="text-red-300/80">
        {label} capped at <span className="font-semibold text-red-300">{cap}</span>
        {" — "}
        <span className="text-red-400/70">{wasted} wasted</span>
      </span>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <p className="mb-1 mt-3 text-[10px] font-semibold uppercase tracking-widest text-white/30 first:mt-0">
      {title}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Exported sections
// ---------------------------------------------------------------------------

export function StatSheet() {
  const finalStats = useForgeStore((s) => s.finalStats);
  const items = useForgeStore((s) => s.items);
  const emblem = useForgeStore((s) => s.emblem);
  const talents = useForgeStore((s) => s.talents);
  const spell = useForgeStore((s) => s.spell);
  const activeSkillIds = useForgeStore((s) => s.activeSkillIds);
  const loadedSkills = useForgeStore((s) => s.loadedSkills);
  const heroStats = useForgeStore((s) => s.heroStats);
  const level = useForgeStore((s) => s.level);
  const itemConditions = useForgeStore((s) => s.itemConditions);

  const s: FinalStats = finalStats;
  const cdDisplay = pct(s.cd);
  const cdWasted = s.cdWasted > 0;
  const cdrCapLabel = pct(s.cdrCap);

  const baseAtkSpd = heroStats
    ? statAtLevel(heroStats.baseAttackSpd, heroStats.atkSpdGrowth, level)
    : 1;

  // Fingerprint of all inputs that affect stats — changes on every distinct user action.
  const fingerprint = [
    level,
    items.map((i) => i?.slug ?? "").join(","),
    emblem?.slug ?? "",
    talents.standard1?.id ?? "",
    talents.standard2?.id ?? "",
    talents.core?.id ?? "",
    spell?.slug ?? "",
    activeSkillIds.join(","),
  ].join("|");

  // Compute vc synchronously during render (no useEffect delay) so StatRow
  // captures the correct colour in the same render cycle as value changes.
  const prevFpRef = React.useRef("");
  const actionGenRef = React.useRef(0);
  if (prevFpRef.current !== fingerprint) {
    prevFpRef.current = fingerprint;
    actionGenRef.current += 1;
  }
  const vc = ACTION_PALETTE[actionGenRef.current % ACTION_PALETTE.length];

  const allSrc = buildSources(items, emblem, talents, spell, activeSkillIds, loadedSkills);
  const flat = (keys: (keyof ItemStats)[]) =>
    getSources(allSrc, keys, (v) => `+${Math.round(v)}`);
  const pctSrc = (keys: (keyof ItemStats)[]) =>
    getSources(allSrc, keys, (v) => `+${v}%`);
  const atkSpdSrc = getSources(allSrc, ["atkSpd"], (v) =>
    `+${((v / 100) * baseAtkSpd).toFixed(2)}/s`
  );

  /**
   * Build a [base +growth +items] breakdown string for flat-additive stats.
   * base    = hero's lv-1 value
   * growth  = hero's per-level growth
   * items   = total item bonus (from allSrc or direct sum)
   */
  const bkd = (base: number, growth: number, itemBonus: number): string => {
    const b  = Math.round(base);
    const g  = Math.round(growth * (level - 1));
    const it = Math.round(itemBonus);
    if (g === 0 && it === 0) return "";
    const parts: string[] = [String(b)];
    if (g  !== 0) parts.push(`${g  >= 0 ? "+" : ""}${g}`);
    if (it !== 0) parts.push(`${it >= 0 ? "+" : ""}${it}`);
    return `[${parts.join(" ")}]`;
  };

  // Pre-compute item sums needed for breakdowns
  const itemSum = (keys: (keyof ItemStats)[]): number =>
    allSrc.reduce((acc, src) => acc + keys.reduce((a, k) => a + ((src.stats[k] as number) ?? 0), 0), 0);

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">Live Stats</p>
      <div className="rounded-lg border border-forge-border bg-forge-surface/60 px-3 py-2">
        <SectionHeader title="Offense" />
        <StatRow label="Phys ATK" value={num(s.physAtk)} valueColor={vc}
          breakdown={heroStats ? bkd(heroStats.baseAtkPhys, heroStats.atkPhysGrowth, itemSum(["physAtk","adaptiveAtk"])) : undefined}
          sources={flat(["physAtk", "adaptiveAtk"])} />
        {itemConditions.bodActive && items.some((i) => i?.slug === "blade-of-despair") && (
          <div className="mb-1 flex items-center gap-1.5 rounded bg-amber-950/40 border border-amber-700/30 px-2 py-1 text-[10px]">
            <span className="text-amber-400">⚔</span>
            <span className="text-amber-300/80">
              Blade of Despair active: <span className="font-semibold text-amber-300">+25% Physical Attack</span>
            </span>
          </div>
        )}
        {items.some((i) => i?.slug === "berserkers-fury") && s.goldenStaffAtkSpdBonus > 0 && (
          <div className="mb-1 flex items-center gap-1.5 rounded bg-red-950/40 border border-red-700/30 px-2 py-1 text-[10px]">
            <span className="text-red-400">⚠</span>
            <span className="text-red-300/80">
              <span className="font-semibold">Anti-synergy:</span> Berserker&apos;s Fury crit damage is wasted — Golden Staff converts all Crit Rate to Atk Speed
            </span>
          </div>
        )}
        <StatRow label="Mag Power" value={num(s.magPower)} valueColor={vc}
          breakdown={heroStats ? bkd(heroStats.baseAtkMag, heroStats.atkMagGrowth, itemSum(["magPower"])) : undefined}
          sources={flat(["magPower"])} />
        {s.holyXtalBoost > 0 && (
          <div className="mb-1 flex items-center gap-1.5 rounded bg-purple-950/40 border border-purple-700/30 px-2 py-1 text-[10px]">
            <span className="text-purple-400">✦</span>
            <span className="text-purple-300/80">
              Holy Crystal: <span className="font-semibold text-purple-300">+{s.holyXtalBoost}%</span> Magic Power (Mystery)
            </span>
          </div>
        )}
        <StatRow label="Atk Speed"
          value={s.atkSpdWasted > 0 ? `${s.atkSpdCap.toFixed(2)}/s (cap)` : `${s.atkSpd.toFixed(2)}/s`}
          warn={s.atkSpdWasted > 0} valueColor={vc}
          sources={atkSpdSrc} />
        {s.atkSpdWasted > 0 && (
          <CapNotice label="Atk Speed" wasted={`${s.atkSpdWasted.toFixed(2)}/s`} cap={`${s.atkSpdCap.toFixed(2)}/s`} />
        )}
        <StatRow label="Crit Rate" value={s.goldenStaffAtkSpdBonus > 0 ? "0% (converted)" : s.critRateWasted > 0 ? `100% (cap)` : pct(s.critRate)}
          warn={s.critRateWasted > 0} valueColor={vc}
          sources={pctSrc(["critRate"])} />
        {s.goldenStaffAtkSpdBonus > 0 && (
          <div className="mb-1 flex items-center gap-1.5 rounded bg-amber-950/40 border border-amber-700/30 px-2 py-1 text-[10px]">
            <span className="text-amber-400">⚡</span>
            <span className="text-amber-300/80">
              Golden Staff: <span className="font-semibold text-amber-300">+{s.goldenStaffAtkSpdBonus}%</span> Atk Speed (converted from Crit)
            </span>
          </div>
        )}
        {s.critRateWasted > 0 && (
          <CapNotice label="Crit Rate" wasted={pct(s.critRateWasted)} cap="100%" />
        )}
        <StatRow label="Crit Dmg" value={pct(s.critDmg - 1)} valueColor={vc}
          sources={pctSrc(["critDmg"])} />
        <StatRow label="Phys Pen" value={num(s.physPen)} valueColor={vc}
          sources={flat(["physPen", "hybridPen"])} />
        {s.physPenPct > 0 && (
          <StatRow label="Phys Pen %" value={pct(s.physPenPct)} valueColor={vc}
            sources={pctSrc(["physPenPct"])} />
        )}
        <StatRow label="Mag Pen" value={num(s.magPen)} valueColor={vc}
          sources={flat(["magPen", "hybridPen"])} />
        {s.magPenPct > 0 && (
          <StatRow label="Mag Pen %" value={pct(s.magPenPct)} valueColor={vc}
            sources={pctSrc(["magPenPct"])} />
        )}
        <StatRow label="Lifesteal" value={s.lifestealWasted > 0 ? `40% (cap)` : pct(s.lifesteal)}
          warn={s.lifestealWasted > 0} valueColor={vc}
          sources={pctSrc(["lifesteal"])} />
        {s.lifestealWasted > 0 && (
          <CapNotice label="Lifesteal" wasted={pct(s.lifestealWasted)} cap="40%" />
        )}
        {(s.magLifesteal > 0 || s.magLifestealWasted > 0) && (
          <>
            <StatRow label="Spell Vamp" value={s.magLifestealWasted > 0 ? `40% (cap)` : pct(s.magLifesteal)}
              warn={s.magLifestealWasted > 0} valueColor={vc}
              sources={pctSrc(["magLifesteal"])} />
            {s.magLifestealWasted > 0 && (
              <CapNotice label="Spell Vamp" wasted={pct(s.magLifestealWasted)} cap="40%" />
            )}
          </>
        )}

        <SectionHeader title="Defense" />
        <StatRow label="HP" value={num(s.hp)} valueColor={vc}
          breakdown={heroStats ? bkd(heroStats.baseHp, heroStats.hpGrowth, itemSum(["hp"])) : undefined}
          sources={flat(["hp"])} />
        {s.bloodWingsShield > 0 && (
          <div className="mb-1 flex items-center gap-1.5 rounded bg-blue-950/40 border border-blue-700/30 px-2 py-1 text-[10px]">
            <span className="text-blue-400">🛡</span>
            <span className="text-blue-300/80">
              Blood Wings Guard: <span className="font-semibold text-blue-300">{s.bloodWingsShield.toLocaleString()} Shield</span> (800 + Mag Power)
            </span>
          </div>
        )}
        {s.mana > 0 && (
          <StatRow label="Mana" value={num(s.mana)} valueColor={vc}
            breakdown={heroStats ? bkd(heroStats.baseMana, heroStats.manaGrowth, itemSum(["mana"])) : undefined}
            sources={flat(["mana"])} />
        )}
        <StatRow label="Armor" value={num(s.armor)} valueColor={vc}
          breakdown={heroStats ? bkd(heroStats.baseArmor, heroStats.armorGrowth, itemSum(["armor"])) : undefined}
          sources={flat(["armor"])} />
        <StatRow label="Mag Res" value={num(s.magRes)} valueColor={vc}
          breakdown={heroStats ? bkd(heroStats.baseMagRes, heroStats.magResGrowth, itemSum(["magRes"])) : undefined}
          sources={flat(["magRes"])} />
        <StatRow label="Eff. HP" value={num(s.eHP)} valueColor={vc} />
        {s.hpRegen > 0 && (
          <StatRow label="HP Regen" value={num(s.hpRegen, 1)} valueColor={vc}
            sources={flat(["hpRegen"])} />
        )}

        <SectionHeader title="Utility" />
        <StatRow label="Move Spd" value={num(s.moveSpeed)} valueColor={vc}
          breakdown={heroStats ? bkd(heroStats.baseMoveSpeed, 0, itemSum(["moveSpeed"])) : undefined}
          sources={flat(["moveSpeed"])} />
        <StatRow
          label="CDR"
          value={cdWasted ? `${cdrCapLabel} (cap)` : cdDisplay}
          warn={cdWasted}
          valueColor={vc}
          sources={pctSrc(["cd"])}
        />
        {cdWasted && (
          <CapNotice label="CDR" wasted={pct(s.cdWasted)} cap={cdrCapLabel} />
        )}
      </div>
    </div>
  );
}

export function GrowthTable() {
  const heroStats = useForgeStore((s) => s.heroStats);
  const hero = useForgeStore((s) => s.hero);

  if (!heroStats || !hero) {
    return (
      <div className="rounded-lg border border-forge-border bg-forge-surface/60 p-4 text-center text-sm text-white/30">
        Select a hero to view growth constants
      </div>
    );
  }

  const stats = [
    { label: "HP",        base: heroStats.baseHp,        growth: heroStats.hpGrowth },
    { label: "Mana",      base: heroStats.baseMana,       growth: heroStats.manaGrowth,      skip: heroStats.baseMana === 0 },
    { label: "Phys ATK",  base: heroStats.baseAtkPhys,   growth: heroStats.atkPhysGrowth },
    { label: "Armor",     base: heroStats.baseArmor,     growth: heroStats.armorGrowth },
    { label: "Mag Res",   base: heroStats.baseMagRes,    growth: heroStats.magResGrowth },
    { label: "Atk Spd",   base: heroStats.baseAttackSpd, growth: heroStats.atkSpdGrowth },
    { label: "Move Spd",  base: heroStats.baseMoveSpeed, growth: 0 },
    { label: "HP Regen",  base: heroStats.baseHpRegen,   growth: 0,                         skip: heroStats.baseHpRegen === 0 },
  ].filter((s) => !s.skip);

  const levels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-white/40">
        {hero.name} — Growth Per Level
      </p>
      <p className="mb-3 text-[10px] text-white/25">Base values at each level, no items or emblems</p>

      {/* Growth summary */}
      <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-0.5 rounded-lg border border-forge-border bg-forge-surface/60 p-3 text-[11px]">
        {stats.map(({ label, base, growth }) => (
          <div key={label} className="flex justify-between">
            <span className="text-white/40">{label}</span>
            <span className="font-mono text-white/70">
              {base}
              {growth > 0 && <span className="text-forge-gold/60"> +{growth}/lv</span>}
            </span>
          </div>
        ))}
      </div>

      {/* Per-level table */}
      <div className="overflow-x-auto rounded-lg border border-forge-border">
        <table className="w-full min-w-max text-[10px]">
          <thead>
            <tr className="border-b border-forge-border bg-forge-surface/80">
              <th className="px-2 py-1.5 text-left font-semibold text-white/30 uppercase tracking-wider">Stat</th>
              {levels.map((lv) => (
                <th key={lv} className="px-2 py-1.5 text-center font-mono text-white/30">{lv}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stats.map(({ label, base, growth }, i) => (
              <tr key={label} className={i % 2 === 0 ? "bg-forge-bg/40" : ""}>
                <td className="px-2 py-1 font-semibold text-white/50 whitespace-nowrap">{label}</td>
                {levels.map((lv) => (
                  <td key={lv} className="px-2 py-1 text-center font-mono text-white/70 tabular-nums">
                    {statAtLevel(base, growth, lv)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Keep RightPane for any legacy usage
export function RightPane() {
  return <StatSheet />;
}
