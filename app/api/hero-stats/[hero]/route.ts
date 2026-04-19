import { NextRequest, NextResponse } from "next/server";

const OPENMLBB = "https://openmlbb.fastapicloud.dev/api";

// Cache responses for 1 hour — winrates don't change by the minute
export const revalidate = 3600;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ hero: string }> }
) {
  const { hero } = await params;

  try {
    const url = `${OPENMLBB}/heroes/${encodeURIComponent(hero)}/stats?rank=all&size=1&lang=en`;
    const res = await fetch(url, { next: { revalidate: 3600 } });

    if (!res.ok) {
      return NextResponse.json({ error: "upstream error" }, { status: 502 });
    }

    const data = await res.json();
    const record = data?.data?.records?.[0]?.data;

    if (!record) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    return NextResponse.json({
      winRate: record.main_hero_win_rate ?? null,
      pickRate: record.main_hero_appearance_rate ?? null,
      banRate: record.main_hero_ban_rate ?? null,
    });
  } catch {
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }
}
