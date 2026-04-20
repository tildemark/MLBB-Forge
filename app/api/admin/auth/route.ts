import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { secret?: string };
  const adminSecret = process.env.ADMIN_SECRET;

  if (!adminSecret || !body.secret || body.secret !== adminSecret) {
    return NextResponse.json({ ok: false, error: "Invalid secret" }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
