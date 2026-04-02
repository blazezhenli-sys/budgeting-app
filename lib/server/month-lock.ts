import type { MonthKey } from "@/lib/types";
import { prisma } from "@/lib/db";

export function monthKeyFromDate(date: Date): MonthKey {
  return date.toISOString().slice(0, 7) as MonthKey;
}

export async function isMonthClosed(userId: string, month: MonthKey): Promise<boolean> {
  const monthRow = await prisma.budgetMonth.findUnique({
    where: {
      userId_monthKey: {
        userId,
        monthKey: month,
      },
    },
    select: { status: true },
  });

  return monthRow?.status === "CLOSED";
}

export async function assertMonthOpen(userId: string, month: MonthKey) {
  if (await isMonthClosed(userId, month)) {
    throw new Error(`Month ${month} is closed.`);
  }
}

export async function assertMonthOpenByDate(userId: string, date: Date) {
  const month = monthKeyFromDate(date);
  await assertMonthOpen(userId, month);
  return month;
}
