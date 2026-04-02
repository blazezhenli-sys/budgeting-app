import { prisma } from "@/lib/db";

export const INFLOW_CATEGORY_NAME = "Inflow: Ready to Assign";

export async function ensureInflowCategory(userId: string) {
  const existing = await prisma.category.findFirst({
    where: {
      userId,
      specialType: "INFLOW",
    },
  });
  if (existing) {
    return existing;
  }

  const group = await prisma.categoryGroup.upsert({
    where: {
      userId_name: {
        userId,
        name: "System",
      },
    },
    create: {
      userId,
      name: "System",
      sortOrder: 0,
    },
    update: {},
  });

  const byName = await prisma.category.findFirst({
    where: {
      userId,
      name: INFLOW_CATEGORY_NAME,
    },
  });

  if (byName) {
    return prisma.category.update({
      where: { id: byName.id },
      data: {
        groupId: group.id,
        specialType: "INFLOW",
      },
    });
  }

  return prisma.category.create({
    data: {
      userId,
      groupId: group.id,
      name: INFLOW_CATEGORY_NAME,
      specialType: "INFLOW",
      archived: false,
    },
  });
}
