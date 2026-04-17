"use client";

import Image from "next/image";
import { useState } from "react";
import { Search, X, Plus } from "lucide-react";
import { useForgeStore, type ItemOption } from "@/lib/store";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cdnUrl } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Item picker sheet
// ---------------------------------------------------------------------------

const CATEGORIES = ["All", "Attack", "Magic", "Defense", "Movement", "Jungling", "Roaming"];

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

  const equippedSlugs = new Set(equipped.filter(Boolean).map((i) => i!.slug));

  const filtered = items.filter((item) => {
    const matchesQuery = item.name.toLowerCase().includes(query.toLowerCase());
    const matchesCat = category === "All" || item.category === category.toUpperCase();
    return matchesQuery && matchesCat;
  });

  function pick(item: ItemOption) {
    setItem(slotIndex, item);
    onOpenChange(false);
  }

  function formatStat(key: string, val: number): string {
    const pctKeys = ["physPenPct", "magPenPct", "critRate", "critDmg", "lifesteal", "magLifesteal", "cd", "atkSpd"];
    if (pctKeys.includes(key)) return `+${(val * 100).toFixed(0)}%`;
    return `+${val}`;
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
                          .map(([k, v]) => formatStat(k, v as number))
                          .join("  ")}
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
}: {
  index: number;
  item: ItemOption | null;
  items: ItemOption[];
}) {
  const setItem = useForgeStore((s) => s.setItem);
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip
          content={
            item ? (
              <div>
                <p className="font-semibold text-forge-gold">{item.name}</p>
                {item.goldCost > 0 && (
                  <p className="text-forge-gold/70">{item.goldCost}g</p>
                )}
                {item.passiveDesc && (
                  <p className="mt-1 text-white/70">{item.passiveDesc}</p>
                )}
              </div>
            ) : (
              "Empty slot"
            )
          }
        >
          <button
            onClick={() => setOpen(true)}
            className="group relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-forge-border bg-forge-bg transition-colors hover:border-forge-gold/50"
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
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setItem(index, null);
                  }}
                  className="absolute right-0.5 top-0.5 hidden rounded-full bg-black/70 p-0.5 group-hover:flex"
                >
                  <X className="h-3 w-3 text-white" />
                </button>
              </>
            ) : (
              <Plus className="h-6 w-6 text-white/20 group-hover:text-forge-gold/50 transition-colors" />
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
// CenterPane
// ---------------------------------------------------------------------------

export function CenterPane({ items }: { items: ItemOption[] }) {
  const equipped = useForgeStore((s) => s.items);

  return (
    <main className="flex flex-1 flex-col items-center gap-8 overflow-y-auto px-6 py-8">
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
    </main>
  );
}
