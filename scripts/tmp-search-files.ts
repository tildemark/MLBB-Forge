import "dotenv/config";
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

const HEROES = ["Arlott", "Chip", "Cici", "Fredrinn", "Harara", "Joy", "Ixia", "Lucas", "Novaria", "Obsidian", "Sora", "Suyou", "Zetian", "ZhuXin", "Zhu Xin", "Zhuxin"];

async function main() {
  for (const name of HEROES) {
    try {
      const files = await withRetry(() => searchFiles(name), 2, 500);
      const head = files.slice(0, 5).join(", ");
      console.log("[" + name + "] -> " + (head || "NONE"));
    } catch (e: any) {
      console.log("[" + name + "] ERROR: " + e.message);
    }
    await new Promise(r => setTimeout(r, 300));
  }
}
main();
