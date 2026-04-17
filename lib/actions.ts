"use server";

import { prisma } from "@/lib/prisma";

export interface SkillData {
  id: string;
  slot: "PASSIVE" | "S1" | "S2" | "S3" | "S4";
  name: string;
  description: string;
  imageFile: string;
}

export async function fetchHeroSkills(heroId: string): Promise<SkillData[]> {
  const skills = await prisma.skill.findMany({
    where: { heroId },
    orderBy: { slot: "asc" },
    select: { id: true, slot: true, name: true, description: true, imageFile: true },
  });
  return skills.map((s) => ({ ...s, slot: s.slot as SkillData["slot"] }));
}
