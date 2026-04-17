"use client";

import { useForgeStore } from "@/lib/store";
import type { FinalStats } from "@/lib/calc";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pct(val: number, decimals = 0) {
  return `${(val * 100).toFixed(decimals)}%`;
}

function num(val: number, decimals = 0) {
  return val.toFixed(decimals);
}

function StatRow({
  label,
  value,
  highlight,
  warn,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-xs text-white/50">{label}</span>
      <span
        className={`text-sm font-medium tabular-nums ${
          highlight ? "text-forge-gold" : warn ? "text-red-400" : "text-white"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <p className="mb-1 mt-4 text-[10px] font-semibold uppercase tracking-widest text-white/30 first:mt-0">
      {title}
    </p>
  );
}

// ---------------------------------------------------------------------------
// RightPane
// ---------------------------------------------------------------------------

export function RightPane() {
  const finalStats = useForgeStore((s) => s.finalStats);
  const s: FinalStats = finalStats;

  const cdDisplay = pct(Math.min(s.cd, 0.4));
  const cdWasted = s.cdWasted > 0;

  return (
    <aside className="flex w-56 shrink-0 flex-col overflow-y-auto border-l border-forge-border bg-forge-surface px-4 py-6">
      <p className="mb-4 font-cinzel text-sm uppercase tracking-widest text-forge-gold">Stats</p>

      {/* OFFENSE */}
      <SectionHeader title="Offense" />
      <StatRow label="Phys ATK" value={num(s.physAtk)} highlight={s.physAtk > 0} />
      <StatRow label="Mag Power" value={num(s.magPower)} highlight={s.magPower > 0} />
      <StatRow label="Attack Speed" value={pct(s.atkSpd, 1)} />
      <StatRow label="Crit Rate" value={pct(s.critRate)} />
      <StatRow label="Crit Damage" value={pct(s.critDmg - 1)} />
      <StatRow label="Phys Pen (flat)" value={num(s.physPen)} />
      {s.physPenPct > 0 && (
        <StatRow label="Phys Pen %" value={pct(s.physPenPct)} />
      )}
      <StatRow label="Mag Pen (flat)" value={num(s.magPen)} />
      {s.magPenPct > 0 && (
        <StatRow label="Mag Pen %" value={pct(s.magPenPct)} />
      )}
      <StatRow label="Lifesteal" value={pct(s.lifesteal)} />
      {s.magLifesteal > 0 && (
        <StatRow label="Spell Vamp" value={pct(s.magLifesteal)} />
      )}

      {/* DEFENSE */}
      <SectionHeader title="Defense" />
      <StatRow label="HP" value={num(s.hp)} highlight />
      {s.mana > 0 && <StatRow label="Mana" value={num(s.mana)} />}
      <StatRow label="Armor" value={num(s.armor)} />
      <StatRow label="Mag Res" value={num(s.magRes)} />
      <StatRow label="Effective HP" value={num(s.eHP)} highlight />
      {s.hpRegen > 0 && <StatRow label="HP Regen" value={num(s.hpRegen, 1)} />}

      {/* UTILITY */}
      <SectionHeader title="Utility" />
      <StatRow label="Move Speed" value={num(s.moveSpeed)} />
      <StatRow
        label="Cooldown Reduction"
        value={cdWasted ? `${cdDisplay} (cap)` : cdDisplay}
        warn={cdWasted}
      />
      {cdWasted && (
        <div className="text-[10px] text-red-400/80">
          {pct(s.cdWasted)} wasted
        </div>
      )}
    </aside>
  );
}
