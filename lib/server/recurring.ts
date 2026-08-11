import { addMonths, addWeeks } from "date-fns";
import type { Prisma } from "@prisma/client";

import { formatDateOnly, parseDateOnly, todayInTimeZone } from "@/lib/date";
import { prisma } from "@/lib/db";
import type { RecurringFrequency } from "@/lib/types";
import { ensureSettings } from "@/lib/server/settings";

export function nextRecurringDate(date: Date, frequency: RecurringFrequency): Date {
  if (frequency === "WEEKLY") {
    return addWeeks(date, 1);
  }
  return addMonths(date, 1);
}

export function normalizeRecurringAmount(
  amount: number,
  categoryId?: string | null,
  categorySpecialType?: string | null,
): number {
  const absoluteAmount = Math.abs(amount);

  if (!categoryId || categorySpecialType === "INFLOW") {
    return absoluteAmount;
  }

  return absoluteAmount * -1;
}

function monthKeyFromDate(date: Date): string {
  return formatDateOnly(date).slice(0, 7);
}

async function resolveRecurringThroughDate(userId: string, throughDateInput?: string): Promise<Date> {
  if (throughDateInput) {
    return parseDateOnly(throughDateInput);
  }

  const settings = await ensureSettings(userId);
  return parseDateOnly(todayInTimeZone(settings.timezone));
}

export function nextQueuedRecurringDate(
  startDate: Date,
  frequency: RecurringFrequency,
  throughDate: Date,
  closedMonths: Set<string>,
): Date | null {
  const throughDateKey = formatDateOnly(throughDate);
  let cursor = new Date(startDate);

  while (formatDateOnly(cursor) <= throughDateKey) {
    if (!closedMonths.has(monthKeyFromDate(cursor))) {
      return cursor;
    }

    cursor = nextRecurringDate(cursor, frequency);
  }

  return null;
}

export async function generateRecurringTransactions(
  userId: string,
  throughDateInput?: string,
  options?: { ruleIds?: string[] },
) {
  const throughDate = await resolveRecurringThroughDate(userId, throughDateInput);
  if (Number.isNaN(throughDate.getTime())) {
    throw new Error("Invalid throughDate");
  }

  const throughDateKey = formatDateOnly(throughDate);
  const limitedRuleIds = options?.ruleIds?.length ? options.ruleIds : null;

  const rules = await prisma.recurringRule.findMany({
    where: {
      userId,
      active: true,
      nextRunDate: { lte: throughDate },
      ...(limitedRuleIds ? { id: { in: limitedRuleIds } } : {}),
    },
    include: {
      category: {
        select: {
          specialType: true,
        },
      },
    },
    orderBy: {
      nextRunDate: "asc",
    },
  });
  const closedMonthRows = await prisma.budgetMonth.findMany({
    where: { userId, status: "CLOSED" },
    select: { monthKey: true },
  });
  const closedMonths = new Set(closedMonthRows.map((row) => row.monthKey));

  let createdCount = 0;

  for (const rule of rules) {
    let nextDate = new Date(rule.nextRunDate);

    while (formatDateOnly(nextDate) <= throughDateKey) {
      const monthKey = monthKeyFromDate(nextDate);
      if (closedMonths.has(monthKey)) {
        nextDate = nextRecurringDate(nextDate, rule.frequency);
        continue;
      }

      // Idempotency: one generated transaction per rule/date pair.
      const generation = await prisma.recurringGeneration.findUnique({
        where: {
          ruleId_occurrenceDate: {
            ruleId: rule.id,
            occurrenceDate: nextDate,
          },
        },
      });

      if (!generation) {
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          const createdTransaction = await tx.transaction.create({
            data: {
              userId,
              accountId: rule.accountId,
              categoryId: rule.categoryId,
              recurringRuleId: rule.id,
              date: nextDate,
              payee: rule.payee,
              memo: rule.memo,
              amount: normalizeRecurringAmount(rule.amount, rule.categoryId, rule.category?.specialType ?? null),
              status: rule.status,
            },
          });

          await tx.recurringGeneration.create({
            data: {
              ruleId: rule.id,
              occurrenceDate: nextDate,
              transactionId: createdTransaction.id,
            },
          });

          createdCount += 1;
        });
      }

      nextDate = nextRecurringDate(nextDate, rule.frequency);
    }

    await prisma.recurringRule.update({
      where: { id: rule.id },
      data: {
        nextRunDate: nextDate,
        lastGeneratedAt: new Date(),
      },
    });
  }

  return { createdCount, throughDate: throughDate.toISOString() };
}

export type RecurringQueueItem = {
  ruleId: string;
  payee: string;
  amount: number;
  frequency: RecurringFrequency;
  nextRunDate: string;
  account: { id: string; name: string };
  category: { id: string; name: string } | null;
};

export async function listRecurringQueue(userId: string, throughDateInput?: string): Promise<RecurringQueueItem[]> {
  const throughDate = await resolveRecurringThroughDate(userId, throughDateInput);
  if (Number.isNaN(throughDate.getTime())) {
    throw new Error("Invalid throughDate");
  }

  const closedMonthRows = await prisma.budgetMonth.findMany({
    where: { userId, status: "CLOSED" },
    select: { monthKey: true },
  });
  const closedMonths = new Set(closedMonthRows.map((row) => row.monthKey));

  const rules = await prisma.recurringRule.findMany({
    where: {
      userId,
      active: true,
      nextRunDate: { lte: throughDate },
    },
    include: {
      account: true,
      category: true,
    },
    orderBy: { nextRunDate: "asc" },
  });

  return rules
    .map((rule) => {
      const queuedDate = nextQueuedRecurringDate(rule.nextRunDate, rule.frequency, throughDate, closedMonths);
      if (!queuedDate) {
        return null;
      }

      return {
        ruleId: rule.id,
        payee: rule.payee,
        amount: normalizeRecurringAmount(rule.amount, rule.categoryId, rule.category?.specialType ?? null),
        frequency: rule.frequency,
        nextRunDate: formatDateOnly(queuedDate),
        account: { id: rule.account.id, name: rule.account.name },
        category: rule.category ? { id: rule.category.id, name: rule.category.name } : null,
      };
    })
    .filter((item): item is RecurringQueueItem => item !== null);
}
