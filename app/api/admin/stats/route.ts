import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function checkAuth(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  const qt = req.nextUrl.searchParams.get("t");
  return auth === `Bearer ${secret}` || qt === secret;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [
    heroes,
    items,
    spells,
    emblems,
    builds,
    buildsPublic,
    skills,
    patches,
    heroRoleRows,
    heroCoverage,
  ] = await Promise.all([
    prisma.hero.count(),
    prisma.item.count(),
    prisma.battleSpell.count(),
    prisma.emblemTree.count(),
    prisma.build.count(),
    prisma.build.count({ where: { isPublic: true } }),
    prisma.skill.count(),
    prisma.patchVersion.findMany({ orderBy: { createdAt: "desc" } }),
    // Role distribution + portrait strip
    prisma.hero.findMany({ select: { role: true, lane: true, name: true, slug: true, imageFile: true }, orderBy: { name: "asc" } }),
    // Coverage: heroes that have at least one stats record + at least one skill
    Promise.all([
      prisma.heroStats.groupBy({ by: ["heroId"], _count: true }).then((r) => r.length),
      prisma.skill.groupBy({ by: ["heroId"], _count: true }).then((r) => r.length),
    ]),
  ]);

  // Tally role counts (a hero can have two roles)
  const roleCounts: Record<string, number> = {};
  const heroList = heroRoleRows.map(({ role, lane, name, slug, imageFile }) => {
    for (const r of role) {
      roleCounts[r] = (roleCounts[r] ?? 0) + 1;
    }
    return { name, slug, imageFile, role, lane: lane ?? "" };
  });

  return NextResponse.json({
    heroes,
    items,
    spells,
    emblems,
    builds,
    buildsPublic,
    skills,
    patches,
    roleCounts,
    heroList,
    heroWithStats: heroCoverage[0],
    heroWithSkills: heroCoverage[1],
  });
}
