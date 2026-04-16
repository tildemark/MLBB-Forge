import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const CDN_BASE = "https://cdn.sanchez.ph/mlbb";

export function cdnUrl(type: "heroes" | "items" | "emblems" | "spells" | "skills" | "talents", file: string) {
  return `${CDN_BASE}/${type}/${file}`;
}
