import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function checkAuth(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  const qt = req.nextUrl.searchParams.get("t");
  return auth === `Bearer ${secret}` || qt === secret;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as {
    action?: string;
    id?: string;
    version?: string;
  };

  if (body.action === "setLatest" && body.id) {
    await prisma.$transaction([
      prisma.patchVersion.updateMany({ where: { isLatest: true }, data: { isLatest: false } }),
      prisma.patchVersion.update({ where: { id: body.id }, data: { isLatest: true } }),
    ]);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "create" && body.version?.trim()) {
    const version = body.version.trim();

    // If version already exists, just set it as latest
    const existing = await prisma.patchVersion.findUnique({ where: { version } });
    if (existing) {
      await prisma.$transaction([
        prisma.patchVersion.updateMany({ where: { isLatest: true }, data: { isLatest: false } }),
        prisma.patchVersion.update({ where: { id: existing.id }, data: { isLatest: true } }),
      ]);
      return NextResponse.json({ ok: true, id: existing.id });
    }

    // Create new and set as latest
    await prisma.patchVersion.updateMany({ where: { isLatest: true }, data: { isLatest: false } });
    const patch = await prisma.patchVersion.create({ data: { version, isLatest: true } });
    return NextResponse.json({ ok: true, id: patch.id });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
