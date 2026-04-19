"use client";

import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

type SliderProps = React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
  /** 0 = level 1 (white/dim), 1 = level 15 (full amber). Enables gradient range. */
  gradientProgress?: number;
};

export function Slider({ className, gradientProgress, ...props }: SliderProps) {
  // Interpolate from a dim white to forge-gold (#c8a84b) as progress goes 0 → 1
  const rangeStyle: React.CSSProperties =
    gradientProgress !== undefined
      ? {
          background: `linear-gradient(to right, rgba(255,255,255,${0.25 + gradientProgress * 0.35}), hsl(${43 + gradientProgress * 5}deg ${Math.round(60 + gradientProgress * 40)}% ${Math.round(40 + gradientProgress * 20)}%))`,
        }
      : {};

  // Thumb border colour tracks the same gradient
  const thumbBorder =
    gradientProgress !== undefined
      ? `hsl(${43 + gradientProgress * 5}deg ${Math.round(60 + gradientProgress * 40)}% ${Math.round(40 + gradientProgress * 20)}%)`
      : undefined;

  return (
    <SliderPrimitive.Root
      className={cn("relative flex w-full touch-none select-none items-center", className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow rounded-full bg-forge-border">
        <SliderPrimitive.Range
          className={cn("absolute h-full rounded-full", gradientProgress === undefined && "bg-forge-gold")}
          style={rangeStyle}
        />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className="block h-4 w-4 rounded-full border bg-forge-surface shadow focus:outline-none focus:ring-2 focus:ring-forge-gold focus:ring-offset-1 focus:ring-offset-forge-bg"
        style={thumbBorder ? { borderColor: thumbBorder } : { borderColor: "var(--forge-gold)" }}
      />
    </SliderPrimitive.Root>
  );
}
