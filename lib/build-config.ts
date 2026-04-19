/**
 * lib/build-config.ts
 *
 * Shared build archetype constants and types.
 * Kept in a separate module (no "use server") so they can be safely imported
 * by both server actions and client components.
 */

export const BUILD_ARCHETYPES = [
  "Crit",
  "Attack Speed",
  "Full Damage",
  "Magic",
  "Tank",
  "Utility",
  "Lifesteal",
  "Poke",
] as const;

export type BuildArchetype = (typeof BUILD_ARCHETYPES)[number];

export type BuildTab = "Popular" | "Top Rated" | BuildArchetype;

export const BUILD_TABS: BuildTab[] = [
  "Popular",
  "Top Rated",
  ...BUILD_ARCHETYPES,
];
