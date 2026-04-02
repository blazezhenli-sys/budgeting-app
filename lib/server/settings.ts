import { prisma } from "@/lib/db";
import { normalizeDisplayCurrency } from "@/lib/money";

export async function ensureSettings(userId: string) {
  const existing = await prisma.setting.findUnique({ where: { userId } });
  if (existing) {
    return existing;
  }

  return prisma.setting.create({
    data: {
      userId,
      currency: normalizeDisplayCurrency(process.env.APP_CURRENCY),
      timezone: process.env.APP_TIMEZONE ?? "UTC",
      monthStartDay: 1,
    },
  });
}
