import { addMonths, endOfDay, format } from "date-fns";

import { prisma } from "@/lib/db";
import { monthBounds } from "@/lib/month";
import { getBudgetMonthView } from "@/lib/server/budget";
import type {
  BudgetCategoryRow,
  MonthKey,
  MonthlyReportView,
  NetWorthTrendPoint,
  SpendingByGroupRow,
  TopPayeeRow,
  TopSpendingCategoryRow,
} from "@/lib/types";

type SpendingInsights = {
  spendingByGroup: SpendingByGroupRow[];
  topSpendingCategories: TopSpendingCategoryRow[];
  totalSpent: number;
};

type ExpenseCategory = {
  categoryId: string;
  categoryName: string;
  groupName: string;
  spent: number;
};

const DEFAULT_NET_WORTH_MONTHS = 12;
const MAX_NET_WORTH_MONTHS = 36;
const TOP_CATEGORY_LIMIT = 8;
const TOP_PAYEE_LIMIT = 8;

function normalizeMonths(windowSize: number): number {
  if (!Number.isFinite(windowSize)) return DEFAULT_NET_WORTH_MONTHS;
  return Math.min(Math.max(Math.floor(windowSize), 2), MAX_NET_WORTH_MONTHS);
}

function monthKeyFromDate(date: Date): MonthKey {
  return format(date, "yyyy-MM") as MonthKey;
}

function monthRangeEndingAt(endMonth: MonthKey, windowSize: number): MonthKey[] {
  const { start } = monthBounds(endMonth);
  const months = normalizeMonths(windowSize);
  const first = addMonths(start, -(months - 1));
  return Array.from({ length: months }, (_, index) => monthKeyFromDate(addMonths(first, index)));
}

function toExpenseCategories(rows: BudgetCategoryRow[]): ExpenseCategory[] {
  return rows
    .map((row) => ({
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      groupName: row.groupName,
      spent: Math.max(row.activity * -1, 0),
    }))
    .filter((row) => row.spent > 0);
}

export function buildSpendingInsights(rows: BudgetCategoryRow[]): SpendingInsights {
  const expenseCategories = toExpenseCategories(rows);
  const totalSpent = expenseCategories.reduce((sum, row) => sum + row.spent, 0);
  const byGroup = new Map<string, { spent: number; categoryNames: Set<string> }>();

  for (const row of expenseCategories) {
    const current = byGroup.get(row.groupName);
    if (!current) {
      byGroup.set(row.groupName, { spent: row.spent, categoryNames: new Set([row.categoryName]) });
      continue;
    }
    current.spent += row.spent;
    current.categoryNames.add(row.categoryName);
  }

  const spendingByGroup: SpendingByGroupRow[] = [...byGroup.entries()]
    .map(([groupName, value]) => ({
      groupName,
      spent: value.spent,
      share: totalSpent > 0 ? value.spent / totalSpent : 0,
      categoryCount: value.categoryNames.size,
    }))
    .sort((a, b) => b.spent - a.spent);

  const topSpendingCategories: TopSpendingCategoryRow[] = expenseCategories
    .sort((a, b) => b.spent - a.spent)
    .slice(0, TOP_CATEGORY_LIMIT)
    .map((row) => ({
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      groupName: row.groupName,
      spent: row.spent,
      share: totalSpent > 0 ? row.spent / totalSpent : 0,
    }));

  return {
    spendingByGroup,
    topSpendingCategories,
    totalSpent,
  };
}

export async function getNetWorthTrend(
  userId: string,
  endMonth: MonthKey,
  windowSize = DEFAULT_NET_WORTH_MONTHS,
): Promise<NetWorthTrendPoint[]> {
  const months = monthRangeEndingAt(endMonth, windowSize);
  const firstMonth = months[0];
  const { start: rangeStart } = monthBounds(firstMonth);
  const { end: rangeEnd } = monthBounds(endMonth);
  const boundedRangeEnd = endOfDay(rangeEnd);

  const [openingBefore, transactionsBefore, openingInRange, transactionsInRange] = await Promise.all([
    prisma.account.aggregate({
      where: {
        userId,
        createdAt: { lt: rangeStart },
      },
      _sum: { openingBalance: true },
    }),
    prisma.transaction.aggregate({
      where: {
        userId,
        date: { lt: rangeStart },
      },
      _sum: { amount: true },
    }),
    prisma.account.findMany({
      where: {
        userId,
        createdAt: { gte: rangeStart, lte: boundedRangeEnd },
      },
      select: {
        openingBalance: true,
        createdAt: true,
      },
    }),
    prisma.transaction.findMany({
      where: {
        userId,
        date: { gte: rangeStart, lte: boundedRangeEnd },
      },
      select: {
        amount: true,
        date: true,
      },
    }),
  ]);

  const openingByMonth = new Map<string, number>();
  const transactionByMonth = new Map<string, number>();

  for (const account of openingInRange) {
    const monthKey = monthKeyFromDate(account.createdAt);
    openingByMonth.set(monthKey, (openingByMonth.get(monthKey) ?? 0) + account.openingBalance);
  }
  for (const transaction of transactionsInRange) {
    const monthKey = monthKeyFromDate(transaction.date);
    transactionByMonth.set(monthKey, (transactionByMonth.get(monthKey) ?? 0) + transaction.amount);
  }

  let runningNetWorth = (openingBefore._sum.openingBalance ?? 0) + (transactionsBefore._sum.amount ?? 0);
  let previousNetWorth = runningNetWorth;

  return months.map((month, index) => {
    runningNetWorth += openingByMonth.get(month) ?? 0;
    runningNetWorth += transactionByMonth.get(month) ?? 0;

    const changeFromPrevious = index === 0 ? 0 : runningNetWorth - previousNetWorth;
    previousNetWorth = runningNetWorth;

    return {
      month,
      netWorth: runningNetWorth,
      changeFromPrevious,
    };
  });
}

export async function getTopPayeesForMonth(userId: string, month: MonthKey): Promise<TopPayeeRow[]> {
  const { start, end } = monthBounds(month);
  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      transferGroup: null,
      amount: { lt: 0 },
      date: { gte: start, lte: endOfDay(end) },
    },
    select: {
      payee: true,
      amount: true,
    },
  });

  const payeeTotals = new Map<string, number>();
  for (const transaction of transactions) {
    const normalizedPayee = transaction.payee.trim() || "Unspecified payee";
    const spent = Math.abs(transaction.amount);
    payeeTotals.set(normalizedPayee, (payeeTotals.get(normalizedPayee) ?? 0) + spent);
  }

  const totalSpent = [...payeeTotals.values()].reduce((sum, value) => sum + value, 0);

  return [...payeeTotals.entries()]
    .map(([payee, spent]) => ({
      payee,
      spent,
      share: totalSpent > 0 ? spent / totalSpent : 0,
    }))
    .sort((a, b) => b.spent - a.spent)
    .slice(0, TOP_PAYEE_LIMIT);
}

export async function getMonthlyReport(userId: string, month: MonthKey): Promise<MonthlyReportView> {
  const budget = await getBudgetMonthView(userId, month);
  const spending = buildSpendingInsights(budget.categories);
  const [netWorthTrend, topPayees] = await Promise.all([
    getNetWorthTrend(userId, month, DEFAULT_NET_WORTH_MONTHS),
    getTopPayeesForMonth(userId, month),
  ]);

  return {
    month,
    totals: budget.totals,
    categorySummary: budget.categories,
    warnings: budget.warnings,
    netWorthTrend,
    spendingByGroup: spending.spendingByGroup,
    topSpendingCategories: spending.topSpendingCategories,
    topPayees,
  };
}
