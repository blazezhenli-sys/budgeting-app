import { addMonths, addWeeks, endOfDay, isBefore } from "date-fns";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import type { RecurringFrequency } from "@/lib/types";

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

export async function generateRecurringTransactions(
  userId: string,
  throughDateInput?: string,
  options?: { ruleIds?: string[] },
) {
  const throughDate = throughDateInput ? endOfDay(new Date(throughDateInput)) : endOfDay(new Date());
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
    let nextDate = rule.nextRunDate;

    while (isBefore(nextDate, throughDate) || nextDate.getTime() === throughDate.getTime()) {
      const monthKey = nextDate.toISOString().slice(0, 7);
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
  const throughDate = throughDateInput ? endOfDay(new Date(throughDateInput)) : endOfDay(new Date());
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
    .filter((rule) => !closedMonths.has(rule.nextRunDate.toISOString().slice(0, 7)))
    .map((rule) => ({
      ruleId: rule.id,
      payee: rule.payee,
      amount: normalizeRecurringAmount(rule.amount, rule.categoryId, rule.category?.specialType ?? null),
      frequency: rule.frequency,
      nextRunDate: rule.nextRunDate.toISOString().slice(0, 10),
      account: { id: rule.account.id, name: rule.account.name },
      category: rule.category ? { id: rule.category.id, name: rule.category.name } : null,
    }));
}
