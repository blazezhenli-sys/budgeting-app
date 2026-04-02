import { format } from "date-fns";

import { prisma } from "@/lib/db";
import { getBudgetMonthView } from "@/lib/server/budget";

function csvEscape(value: string | number | null | undefined): string {
  const stringValue = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function rowsToCsv(rows: Array<Record<string, string | number | null | undefined>>): string {
  if (rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];

  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(","));
  }

  return `${lines.join("\n")}\n`;
}

export async function exportTransactionsCsv(userId: string): Promise<string> {
  const transactions = await prisma.transaction.findMany({
    where: { userId },
    include: {
      account: true,
      category: true,
      splits: {
        include: { category: true },
      },
    },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });

  const rows: Array<Record<string, string | number | null | undefined>> = [];

  for (const row of transactions) {
    if (!row.splits.length) {
      rows.push({
        id: row.id,
        date: format(row.date, "yyyy-MM-dd"),
        account: row.account.name,
        payee: row.payee,
        memo: row.memo,
        amount_cents: row.amount,
        category: row.category?.name,
        status: row.status,
        transfer_group: row.transferGroup,
        split_index: null,
        split_memo: null,
      });
      continue;
    }

    row.splits.forEach((split, splitIndex) => {
      rows.push({
        id: row.id,
        date: format(row.date, "yyyy-MM-dd"),
        account: row.account.name,
        payee: row.payee,
        memo: row.memo,
        amount_cents: split.amount,
        category: split.category.name,
        status: row.status,
        transfer_group: row.transferGroup,
        split_index: splitIndex + 1,
        split_memo: split.memo,
      });
    });
  }

  return rowsToCsv(rows);
}

export async function exportAssignmentsCsv(userId: string): Promise<string> {
  const rows = await prisma.categoryBudget.findMany({
    where: { userId },
    include: {
      category: true,
      budgetMonth: true,
    },
    orderBy: [{ budgetMonth: { monthKey: "asc" } }, { category: { name: "asc" } }],
  });

  return rowsToCsv(
    rows.map((row) => ({
      month: row.budgetMonth.monthKey,
      category: row.category.name,
      assigned_cents: row.assigned,
    })),
  );
}

export async function exportCategoryBalancesCsv(userId: string): Promise<string> {
  const months = await prisma.budgetMonth.findMany({
    where: { userId },
    orderBy: { monthKey: "asc" },
    select: { monthKey: true },
  });

  const rows: Array<Record<string, string | number>> = [];

  for (const month of months) {
    const view = await getBudgetMonthView(userId, month.monthKey as `${number}-${number}`);
    for (const row of view.categories) {
      rows.push({
        month: month.monthKey,
        group: row.groupName,
        category: row.categoryName,
        assigned_cents: row.assigned,
        activity_cents: row.activity,
        available_cents: row.available,
      });
    }
  }

  return rowsToCsv(rows);
}
