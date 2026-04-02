import { parse } from "csv-parse/sync";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { toCents } from "@/lib/money";
import { checksum, dedupeHash } from "@/lib/server/hash";
import { ensureInflowCategory } from "@/lib/server/inflow";
import type { ImportError } from "@/lib/types";

type ParsedRow = {
  date: string;
  account: string;
  payee: string;
  memo: string;
  amount: number;
  category: string;
  status: "CLEARED" | "UNCLEARED";
  rowNumber: number;
  dedupeHash: string;
};

const REQUIRED_COLUMNS = ["date", "account", "payee", "memo", "amount", "category"];
const TRANSFER_TOKEN_REGEX = /transfer:([A-Za-z0-9_-]+)/i;

function parseStatus(raw: string): "CLEARED" | "UNCLEARED" {
  const normalized = raw.trim().toLowerCase();
  return normalized === "cleared" ? "CLEARED" : "UNCLEARED";
}

export function parseCsvRows(csvText: string): { rows: ParsedRow[]; errors: ImportError[] } {
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  const errors: ImportError[] = [];
  const rows: ParsedRow[] = [];

  if (!records.length) {
    return {
      rows,
      errors: [{ row: 0, field: "csv", reason: "CSV file is empty" }],
    };
  }

  const columns = Object.keys(records[0]);
  for (const column of REQUIRED_COLUMNS) {
    if (!columns.includes(column)) {
      errors.push({ row: 0, field: column, reason: "Missing required column" });
    }
  }

  records.forEach((record, index) => {
    const rowNumber = index + 2;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date ?? "")) {
      errors.push({ row: rowNumber, field: "date", reason: "Expected YYYY-MM-DD" });
      return;
    }

    let amount = 0;
    try {
      amount = toCents(record.amount ?? "");
    } catch {
      errors.push({ row: rowNumber, field: "amount", reason: "Invalid numeric amount" });
      return;
    }

    const parsed: ParsedRow = {
      date: record.date,
      account: record.account ?? "",
      payee: record.payee ?? "",
      memo: record.memo ?? "",
      amount,
      category: record.category ?? "",
      status: parseStatus(record.status ?? ""),
      rowNumber,
      dedupeHash: dedupeHash({
        date: record.date,
        amount,
        payee: record.payee ?? "",
        account: record.account ?? "",
        memo: record.memo ?? "",
      }),
    };

    if (!parsed.account.trim()) {
      errors.push({ row: rowNumber, field: "account", reason: "Account is required" });
      return;
    }

    if (!parsed.payee.trim()) {
      errors.push({ row: rowNumber, field: "payee", reason: "Payee is required" });
      return;
    }

    if (parsed.amount < 0 && !parsed.category.trim() && !TRANSFER_TOKEN_REGEX.test(parsed.memo)) {
      errors.push({ row: rowNumber, field: "category", reason: "Expense rows require category or transfer token" });
      return;
    }

    rows.push(parsed);
  });

  return { rows, errors };
}

function transferToken(row: ParsedRow): string | null {
  const match = row.memo.match(TRANSFER_TOKEN_REGEX);
  return match?.[1] ?? null;
}

export async function importCsv(
  userId: string,
  params: { fileName: string; csvText: string; commit: boolean },
) {
  const { rows, errors } = parseCsvRows(params.csvText);

  const inflowCategory = await ensureInflowCategory(userId);
  const [accountRows, categoryRows, closedMonthRows] = await Promise.all([
    prisma.account.findMany({ where: { userId } }),
    prisma.category.findMany({ where: { userId } }),
    prisma.budgetMonth.findMany({
      where: { userId, status: "CLOSED" },
      select: { monthKey: true },
    }),
  ]);
  const closedMonths = new Set(closedMonthRows.map((row) => row.monthKey));

  const accountsByName = new Map(accountRows.map((account) => [account.name.toLowerCase(), account]));
  const categoriesByName = new Map(categoryRows.map((category) => [category.name.toLowerCase(), category]));

  const transferGroups = new Map<string, ParsedRow[]>();
  const validationErrors: ImportError[] = [...errors];

  for (const row of rows) {
    const rowMonth = row.date.slice(0, 7);
    if (closedMonths.has(rowMonth)) {
      validationErrors.push({ row: row.rowNumber, field: "date", reason: `Month ${rowMonth} is closed` });
      continue;
    }

    if (!accountsByName.has(row.account.toLowerCase())) {
      validationErrors.push({ row: row.rowNumber, field: "account", reason: "Account name not found" });
      continue;
    }

    const token = transferToken(row);
    if (!row.category.trim() && token) {
      const existing = transferGroups.get(token) ?? [];
      existing.push(row);
      transferGroups.set(token, existing);
      continue;
    }

    if (row.category.trim() && !categoriesByName.has(row.category.toLowerCase())) {
      validationErrors.push({ row: row.rowNumber, field: "category", reason: "Category name not found" });
      continue;
    }

    if (row.amount > 0 && row.category.trim()) {
      const category = categoriesByName.get(row.category.toLowerCase());
      if (category?.specialType !== "INFLOW") {
        validationErrors.push({
          row: row.rowNumber,
          field: "category",
          reason: "Income rows must use Inflow: Ready to Assign category (or leave category blank).",
        });
      }
    }

    if (row.amount < 0 && row.category.trim()) {
      const category = categoriesByName.get(row.category.toLowerCase());
      if (category?.specialType === "INFLOW") {
        validationErrors.push({
          row: row.rowNumber,
          field: "category",
          reason: "Expense rows cannot use Inflow: Ready to Assign.",
        });
      }
    }
  }

  for (const [token, tokenRows] of transferGroups.entries()) {
    if (tokenRows.length !== 2) {
      for (const row of tokenRows) {
        validationErrors.push({
          row: row.rowNumber,
          field: "memo",
          reason: `Transfer token ${token} must appear exactly twice`,
        });
      }
      continue;
    }

    if (tokenRows[0].amount + tokenRows[1].amount !== 0) {
      for (const row of tokenRows) {
        validationErrors.push({
          row: row.rowNumber,
          field: "amount",
          reason: `Transfer token ${token} rows must balance to zero`,
        });
      }
    }
  }

  if (!params.commit) {
    return {
      committed: false,
      rows: rows.length,
      validRows: rows.length - validationErrors.length,
      errors: validationErrors,
    };
  }

  const importRecord = await prisma.import.create({
    data: {
      userId,
      fileName: params.fileName,
      checksum: checksum(params.csvText),
      rowCount: rows.length,
    },
  });

  const existingHashes = new Set(
    (
      await prisma.transaction.findMany({
        where: {
          userId,
          dedupeHash: { in: rows.map((row) => row.dedupeHash) },
        },
        select: { dedupeHash: true },
      })
    )
      .map((row) => row.dedupeHash)
      .filter((value): value is string => Boolean(value)),
  );

  let importedCount = 0;
  let duplicateCount = 0;

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const row of rows) {
      const rowError = validationErrors.find((error) => error.row === row.rowNumber);
      if (rowError) {
        await tx.importRow.create({
          data: {
            importId: importRecord.id,
            rowNumber: row.rowNumber,
            raw: row,
            status: "ERROR",
            error: `${rowError.field}: ${rowError.reason}`,
            dedupeHash: row.dedupeHash,
          },
        });
        continue;
      }

      if (existingHashes.has(row.dedupeHash)) {
        duplicateCount += 1;
        await tx.importRow.create({
          data: {
            importId: importRecord.id,
            rowNumber: row.rowNumber,
            raw: row,
            status: "DUPLICATE",
            dedupeHash: row.dedupeHash,
            error: "Duplicate transaction hash",
          },
        });
        continue;
      }

      const account = accountsByName.get(row.account.toLowerCase());
      if (!account) {
        continue;
      }

      const token = transferToken(row);
      const parsedDate = new Date(`${row.date}T00:00:00.000Z`);

      let categoryId: string | null = null;
      let transferGroup: string | null = null;

      if (token) {
        transferGroup = `import-${importRecord.id}-${token}`;
      } else if (row.category.trim()) {
        categoryId = categoriesByName.get(row.category.toLowerCase())?.id ?? null;
      } else if (row.amount > 0) {
        categoryId = inflowCategory.id;
      }

      await tx.transaction.create({
        data: {
          userId,
          accountId: account.id,
          categoryId,
          importId: importRecord.id,
          date: parsedDate,
          payee: row.payee,
          memo: row.memo,
          amount: row.amount,
          status: row.status,
          transferGroup,
          dedupeHash: row.dedupeHash,
        },
      });

      await tx.importRow.create({
        data: {
          importId: importRecord.id,
          rowNumber: row.rowNumber,
          raw: row,
          status: "IMPORTED",
          dedupeHash: row.dedupeHash,
        },
      });

      existingHashes.add(row.dedupeHash);
      importedCount += 1;
    }

    await tx.import.update({
      where: { id: importRecord.id },
      data: {
        committedAt: new Date(),
        importedCount,
        duplicateCount,
        errorCount: validationErrors.length,
      },
    });
  });

  return {
    committed: true,
    importId: importRecord.id,
    rows: rows.length,
    importedCount,
    duplicateCount,
    errors: validationErrors,
  };
}
