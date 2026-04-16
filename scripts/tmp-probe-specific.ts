import "dotenv/config";
import { prisma } from "../lib/prisma";
import { withRetry } from "./lib/mediawiki";

const MW_API = "https://mobile-legends.fandom.com/api.php";

async function searchFiles(query: string): Promise<string[]> {
  const params = new URLSearchParams({
    action: "query",
    list: "allimages",
    aifrom: query,
    aito: query + "~",
    ailimit: "10",
    format: "json",
  });
  const res = await fetch(`${MW_API}?${params}`);
  const data: any = await res.json();
  return (data.query?.allimages ?? []).map((img: any) => img.name as string);
}

async function getPageMainImage(heroName: string): Promise<string | null> {
  const params = new URLSearchParams({
    action: "query",
    prop: "pageimages",
    titles: heroName,
    pithumbsize: "240",
    format: "json",
  });
  const res = await fetch(`${MW_API}?${params}`);
  const data: any = await res.json();
  const pages = Object.values(data.query?.pages ?? {}) as any[];
  return pages[0]?.thumbnail?.source?.replace(/\/revision\/.*$/, "") ?? null;
}

async function main() {
  // Print all hero slugs/names from DB containing these strings
  const heroes = await prisma.hero.findMany({ select: { slug: true, name: true, imageFile: true }, orderBy: { name: "asc" } });
  const targets = ["luka", "sora", "hira", "obs", "chip", "arllo", "cici", "fred", "joy", "ixia", "novaria", "suyo", "zeti", "zhu"];
  
  console.log("=== DB heroes matching targets ===");
  for (const h of heroes) {
    if (targets.some(t => h.name.toLowerCase().includes(t) || h.slug.includes(t))) {
      console.log(`  slug=${h.slug} name="${h.name}" imageFile=${h.imageFile}`);
    }
  }

  console.log("\n=== Wiki file search ===");
  const names = ["Lukas", "Lucas", "Sora", "Hiara", "Harara", "Hirara", "Obsidian", "Chip"];
  for (const n of names) {
    const files = await withRetry(() => searchFiles(n), 2, 300);
    const thumb = await getPageMainImage(n);
    console.log(`[${n}] files: ${files.slice(0,3).join(", ") || "NONE"}`);
    console.log(`  pageimage: ${thumb ?? "NONE"}`);
    await new Promise(r => setTimeout(r, 300));
  }
  await prisma.$disconnect();
}
main();
