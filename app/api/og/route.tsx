import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { fetchBuildBySlug } from "@/lib/actions";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") ?? "";
  const build = slug && slug !== "default"
    ? (await fetchBuildBySlug(slug)) as
        | (Awaited<ReturnType<typeof fetchBuildBySlug>> & { heroName?: string })
        | null
    : null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://forge.sanchez.ph";
  const cdnBase = process.env.NEXT_PUBLIC_CDN_URL ?? "https://cdn.sanchez.ph/mlbb/";

  const heroName = build?.heroName ?? "MLBB Forge";
  const buildTitle = build?.title ?? "Build";
  const author = build?.authorName ? `by ${build.authorName}` : "";
  const tags = build?.tags?.slice(0, 3).join(" · ") ?? "";

  const itemImages = (build?.items ?? [])
    .sort((a, b) => a.slot - b.slot)
    .slice(0, 6)
    .map((bi) => `${cdnBase}items/${bi.item.imageFile}`);

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          background: "linear-gradient(135deg, #0a0c10 0%, #111827 60%, #0f172a 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "60px 80px",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* Branding */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
          <div style={{
            fontSize: "14px", fontWeight: 700, letterSpacing: "4px", textTransform: "uppercase",
            color: "#c9a227", opacity: 0.8,
          }}>
            MLBB FORGE
          </div>
          <div style={{ width: "1px", height: "16px", background: "#ffffff20" }} />
          <div style={{ fontSize: "13px", color: "#ffffff40", letterSpacing: "2px" }}>
            {heroName.toUpperCase()}
          </div>
        </div>

        {/* Build title */}
        <div style={{
          fontSize: "52px", fontWeight: 700, color: "#ffffff",
          lineHeight: 1.1, maxWidth: "900px", marginBottom: "12px",
        }}>
          {buildTitle}
        </div>

        {/* Author + tags */}
        <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "36px" }}>
          {author && (
            <div style={{ fontSize: "16px", color: "#a78bfa" }}>{author}</div>
          )}
          {tags && (
            <div style={{ fontSize: "14px", color: "#ffffff50", letterSpacing: "1px" }}>{tags}</div>
          )}
        </div>

        {/* Item icons */}
        <div style={{ display: "flex", gap: "12px" }}>
          {itemImages.map((src, i) => (
            <div key={i} style={{
              width: "72px", height: "72px", borderRadius: "8px",
              background: "#ffffff10", border: "1px solid #ffffff15",
              overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" width={72} height={72} style={{ objectFit: "contain" }} />
            </div>
          ))}
        </div>

        {/* Footer URL */}
        <div style={{
          position: "absolute", bottom: "40px", right: "80px",
          fontSize: "14px", color: "#ffffff25", letterSpacing: "1px",
        }}>
          {appUrl.replace(/^https?:\/\//, "")}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
