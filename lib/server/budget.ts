import { endOfDay } from "date-fns";

import { prisma } from "@/lib/db";
import { monthBounds } from "@/lib/month";
import { ensureInflowCategory } from "@/lib/server/inflow";
import type { BudgetMonthView, MonthKey } from "@/lib/types";

type AmountMap = Map<string, number>;

function addToMap(map: AmountMap, key: string, value: number) {
  map.set(key, (map.get(key) ?? 0) + value);
}

export function categoryAvailable(carryover: number, assigned: number, activity: number): number {
  return carryover + assigned + activity;
}

export function availableToAssign(
  incomeBefore: number,
  incomeCurrent: number,
  assignedBefore: number,
  assignedCurrent: number,
): number {
  return incomeBefore + incomeCurrent - assignedBefore - assignedCurrent;
}

export async function ensureBudgetMonth(userId: string, month: MonthKey) {
  return prisma.budgetMonth.upsert({
    where: {
      userId_monthKey: {
        userId,
        monthKey: month,
      },
    },
    create: {
      userId,
      monthKey: month,
      status: "OPEN",
    },
    update: {},
  });
}

export async function setBudgetMonthStatus(userId: string, month: MonthKey, status: "OPEN" | "CLOSED") {
  await ensureBudgetMonth(userId, month);
  return prisma.budgetMonth.update({
    where: {
      userId_monthKey: {
        userId,
        monthKey: month,
      },
    },
    data: {
      status,
      closedAt: status === "CLOSED" ? new Date() : null,
    },
  });
}

async function incomeSum(userId: string, start?: Date, end?: Date): Promise<number> {
  const aggregate = await prisma.transaction.aggregate({
    where: {
      userId,
      transferGroup: null,
      amount: { gt: 0 },
      OR: [{ categoryId: null }, { category: { specialType: "INFLOW" } }],
      ...(start || end
        ? {
            date: {
              ...(start ? { gte: start } : {}),
              ...(end ? { lte: end } : {}),
            },
          }
        : {}),
    },
    _sum: {
      amount: true,
    },
  });

  return aggregate._sum.amount ?? 0;
}

async function assignedSum(userId: string, month: MonthKey, currentMonth = false): Promise<number> {
  const aggregate = await prisma.categoryBudget.aggregate({
    where: {
      userId,
      budgetMonth: currentMonth ? { monthKey: month } : { monthKey: { lt: month } },
    },
    _sum: {
      assigned: true,
    },
  });

  return aggregate._sum.assigned ?? 0;
}

type ActivityRange = {
  start?: Date;
  end?: Date;
};

async function activityByCategory(userId: string, range: ActivityRange): Promise<AmountMap> {
  const dateFilter = {
    ...(range.start ? { gte: range.start } : {}),
    ...(range.end ? { lte: range.end } : {}),
  };

  const splitDelegate = (
    prisma as unknown as {
      transactionSplit?: {
        findMany: (args: unknown) => Promise<Array<{ categoryId: string; amount: number }>>;
      };
    }
  ).transactionSplit;
  const supportsSplits = Boolean(splitDelegate?.findMany);

  const [nonSplitTransactions, splitRows] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        userId,
        transferGroup: null,
        category: { specialType: null },
        ...(supportsSplits ? { splits: { none: {} } } : {}),
        ...(range.start || range.end ? { date: dateFilter } : {}),
      },
      select: { categoryId: true, amount: true },
    }),
    supportsSplits
      ? splitDelegate!.findMany({
          where: {
            category: { specialType: null },
            transaction: {
              userId,
              transferGroup: null,
              ...(range.start || range.end ? { date: dateFilter } : {}),
            },
          },
          select: { categoryId: true, amount: true },
        })
      : Promise.resolve([]),
  ]);

  const result: AmountMap = new Map();

  for (const item of nonSplitTransactions) {
    if (item.categoryId) {
      addToMap(result, item.categoryId, item.amount);
    }
  }

  for (const split of splitRows) {
    addToMap(result, split.categoryId, split.amount);
  }

  return result;
}

export async function assignmentCapacity(userId: string, month: MonthKey): Promise<number> {
  await ensureInflowCategory(userId);
  const { start, end } = monthBounds(month);

  const [incomeBefore, incomeCurrent, assignedBefore] = await Promise.all([
    incomeSum(userId, undefined, new Date(start.getTime() - 1)),
    incomeSum(userId, start, end),
    assignedSum(userId, month),
  ]);

  return incomeBefore + incomeCurrent - assignedBefore;
}

export async function getBudgetMonthView(userId: string, month: MonthKey): Promise<BudgetMonthView> {
  await ensureInflowCategory(userId);
  const { start, end } = monthBounds(month);
  const budgetMonth = await ensureBudgetMonth(userId, month);

  const [categories, currentAssignments, priorAssignments, currentActivity, priorActivity] =
    await Promise.all([
      prisma.category.findMany({
        where: { userId, specialType: null },
        include: { group: true },
        orderBy: [{ group: { sortOrder: "asc" } }, { name: "asc" }],
      }),
      prisma.categoryBudget.findMany({
        where: {
          userId,
          category: { specialType: null },
          budgetMonth: { monthKey: month },
        },
      }),
      prisma.categoryBudget.findMany({
        where: {
          userId,
          category: { specialType: null },
          budgetMonth: { monthKey: { lt: month } },
        },
      }),
      activityByCategory(userId, { start, end }),
      activityByCategory(userId, { end: new Date(start.getTime() - 1) }),
    ]);

  const assignedCurrentByCategory: AmountMap = new Map();
  const assignedPriorByCategory: AmountMap = new Map();
  const activityCurrentByCategory: AmountMap = currentActivity;
  const activityPriorByCategory: AmountMap = priorActivity;

  for (const item of currentAssignments) {
    addToMap(assignedCurrentByCategory, item.categoryId, item.assigned);
  }
  for (const item of priorAssignments) {
    addToMap(assignedPriorByCategory, item.categoryId, item.assigned);
  }
  const [incomeBefore, incomeCurrent, assignedBefore, assignedCurrent] = await Promise.all([
    incomeSum(userId, undefined, new Date(start.getTime() - 1)),
    incomeSum(userId, start, endOfDay(end)),
    assignedSum(userId, month),
    assignedSum(userId, month, true),
  ]);

  const rows = categories.map((category) => {
    const assigned = assignedCurrentByCategory.get(category.id) ?? 0;
    const activity = activityCurrentByCategory.get(category.id) ?? 0;
    const carryover =
      (assignedPriorByCategory.get(category.id) ?? 0) + (activityPriorByCategory.get(category.id) ?? 0);
    const available = categoryAvailable(carryover, assigned, activity);

    return {
      categoryId: category.id,
      categoryName: category.name,
      groupId: category.groupId,
      groupName: category.group.name,
      assigned,
      activity,
      available,
      targetMonthly: category.targetMonthly,
      overspent: available < 0,
      archived: category.archived,
    };
  });

  const spent = rows
    .map((row) => row.activity)
    .filter((amount) => amount < 0)
    .reduce((sum, amount) => sum + Math.abs(amount), 0);

  const ready = availableToAssign(incomeBefore, incomeCurrent, assignedBefore, assignedCurrent);
  const warnings = rows.filter((row) => row.overspent).map((row) => `${row.categoryName} is overspent`);

  return {
    month,
    status: budgetMonth.status,
    totals: {
      income: incomeCurrent,
      assigned: assignedCurrent,
      spent,
      availableToAssign: ready,
    },
    categories: rows,
    warnings,
  };
}

export async function upsertBudgetAssignments(
  userId: string,
  month: MonthKey,
  assignments: Array<{ categoryId: string; assigned: number }>,
) {
  await ensureInflowCategory(userId);
  const budgetMonth = await ensureBudgetMonth(userId, month);
  if (budgetMonth.status === "CLOSED") {
    throw new Error("This month is closed. Reopen it before changing assignments.");
  }

  const allowedCategoryIds = new Set(
    (
      await prisma.category.findMany({
        where: {
          userId,
          specialType: null,
          id: { in: assignments.map((item) => item.categoryId) },
        },
        select: { id: true },
      })
    ).map((row) => row.id),
  );
  for (const item of assignments) {
    if (!allowedCategoryIds.has(item.categoryId)) {
      throw new Error("Invalid category assignment target");
    }
  }

  const [currentRows, capacity] = await Promise.all([
    prisma.categoryBudget.findMany({
      where: { userId, budgetMonthId: budgetMonth.id, category: { specialType: null } },
    }),
    assignmentCapacity(userId, month),
  ]);

  const merged = new Map<string, number>();
  for (const row of currentRows) {
    merged.set(row.categoryId, row.assigned);
  }
  for (const row of assignments) {
    merged.set(row.categoryId, row.assigned);
  }

  const newAssignedTotal = [...merged.values()].reduce((sum, value) => sum + value, 0);
  if (newAssignedTotal > capacity) {
    throw new Error("Assigned dollars exceed available income for this month");
  }

  await prisma.$transaction(
    assignments.map((item) =>
      prisma.categoryBudget.upsert({
        where: {
          budgetMonthId_categoryId: {
            budgetMonthId: budgetMonth.id,
            categoryId: item.categoryId,
          },
        },
        create: {
          userId,
          budgetMonthId: budgetMonth.id,
          categoryId: item.categoryId,
          assigned: item.assigned,
        },
        update: {
          assigned: item.assigned,
        },
      }),
    ),
  );

  return getBudgetMonthView(userId, month);
}

export async function quickFundMonthlyTargets(userId: string, month: MonthKey) {
  const budget = await getBudgetMonthView(userId, month);
  if (budget.status === "CLOSED") {
    throw new Error("This month is closed. Reopen it before funding targets.");
  }

  let remaining = budget.totals.availableToAssign;
  const updates: Array<{ categoryId: string; assigned: number }> = [];

  for (const row of budget.categories) {
    if (!row.targetMonthly || row.targetMonthly <= 0 || remaining <= 0) {
      continue;
    }

    const needed = Math.max(row.targetMonthly - row.available, 0);
    if (needed <= 0) {
      continue;
    }

    const funded = Math.min(needed, remaining);
    if (funded <= 0) {
      continue;
    }

    updates.push({
      categoryId: row.categoryId,
      assigned: row.assigned + funded,
    });
    remaining -= funded;
  }

  if (!updates.length) {
    return {
      fundedCount: 0,
      fundedAmount: 0,
      budget,
    };
  }

  const updatedBudget = await upsertBudgetAssignments(userId, month, updates);
  const fundedAmount = updates.reduce((sum, update) => {
    const previous = budget.categories.find((row) => row.categoryId === update.categoryId)?.assigned ?? 0;
    return sum + Math.max(update.assigned - previous, 0);
  }, 0);

  return {
    fundedCount: updates.length,
    fundedAmount,
    budget: updatedBudget,
  };
}
