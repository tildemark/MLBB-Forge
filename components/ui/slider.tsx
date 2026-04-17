"use client";

import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

export function Slider({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      className={cn("relative flex w-full touch-none select-none items-center", className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow rounded-full bg-forge-border">
        <SliderPrimitive.Range className="absolute h-full rounded-full bg-forge-gold" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border border-forge-gold bg-forge-surface shadow focus:outline-none focus:ring-2 focus:ring-forge-gold focus:ring-offset-1 focus:ring-offset-forge-bg" />
    </SliderPrimitive.Root>
  );
}
