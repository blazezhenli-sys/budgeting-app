import { Prisma, PrismaClient, type RecurringFrequency, type TransactionStatus } from "@prisma/client";
import { addMonths, addWeeks, subMonths, subWeeks } from "date-fns";

const prisma = new PrismaClient();

function normalizeRecurringAmount(amount: number, categoryId?: string | null, categorySpecialType?: string | null): number {
  const absoluteAmount = Math.abs(amount);

  if (!categoryId || categorySpecialType === "INFLOW") {
    return absoluteAmount;
  }

  return absoluteAmount * -1;
}

function nextRecurringDate(date: Date, frequency: RecurringFrequency): Date {
  if (frequency === "WEEKLY") {
    return addWeeks(date, 1);
  }

  return addMonths(date, 1);
}

function previousRecurringDate(date: Date, frequency: RecurringFrequency): Date {
  if (frequency === "WEEKLY") {
    return subWeeks(date, 1);
  }

  return subMonths(date, 1);
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function parseDateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(Number.NaN);
  }

  return new Date(`${value}T00:00:00.000Z`);
}

function readFlag(name: string): boolean {
  return process.argv.includes(name);
}

function readArgValue(prefix: string): string | undefined {
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

type RuleRow = {
  id: string;
  userId: string;
  accountId: string;
  amount: number;
  categoryId: string | null;
  payee: string;
  memo: string | null;
  status: TransactionStatus;
  frequency: RecurringFrequency;
  nextRunDate: Date;
  createdAt: Date;
  lastGeneratedAt: Date | null;
  user: { email: string };
  category: { specialType: string | null } | null;
};

type TransactionRow = {
  id: string;
  userId: string;
  accountId: string;
  recurringRuleId: string | null;
  amount: number;
  categoryId: string | null;
  payee: string;
  memo: string | null;
  date: Date;
  status: TransactionStatus;
  user: { email: string };
  category: { specialType: string | null } | null;
  recurringRule: {
    id: string;
    categoryId: string | null;
    category: { specialType: string | null } | null;
  } | null;
};

type RecurringGenerationRow = {
  id: string;
  ruleId: string;
  occurrenceDate: Date;
  transactionId: string;
};

function matchesUserFilter(user: { id: string; email: string }, userId?: string, userEmail?: string): boolean {
  if (userId && user.id !== userId) {
    return false;
  }

  if (userEmail && user.email.toLowerCase() !== userEmail.toLowerCase()) {
    return false;
  }

  return true;
}

function desiredTransactionAmount(row: TransactionRow): number | null {
  if (row.categoryId) {
    return normalizeRecurringAmount(row.amount, row.categoryId, row.category?.specialType ?? null);
  }

  if (row.recurringRule) {
    return normalizeRecurringAmount(
      row.amount,
      row.recurringRule.categoryId,
      row.recurringRule.category?.specialType ?? null,
    );
  }

  return null;
}

function listCandidateOccurrenceDates(rule: RuleRow, throughDate: Date): Date[] {
  const createdDay = dateKey(rule.createdAt);
  const dates: Date[] = [];
  let cursor = new Date(rule.nextRunDate);

  while (cursor.getTime() > throughDate.getTime()) {
    cursor = previousRecurringDate(cursor, rule.frequency);
  }

  while (dateKey(cursor) >= createdDay) {
    dates.push(new Date(cursor));
    cursor = previousRecurringDate(cursor, rule.frequency);
  }

  return dates.sort((left, right) => left.getTime() - right.getTime());
}

function computeAdvancedNextRunDate(rule: RuleRow, throughDate: Date): Date {
  let nextDate = new Date(rule.nextRunDate);

  while (nextDate.getTime() <= throughDate.getTime()) {
    nextDate = nextRecurringDate(nextDate, rule.frequency);
  }

  return nextDate;
}

async function main() {
  const shouldCommit = readFlag("--commit");
  const userId = readArgValue("--user-id=");
  const userEmail = readArgValue("--user-email=");
  const throughDateArg = readArgValue("--through-date=");
  const throughDate = throughDateArg
    ? parseDateOnly(throughDateArg)
    : parseDateOnly(new Date().toISOString().slice(0, 10));

  if (Number.isNaN(throughDate.getTime())) {
    throw new Error("Invalid --through-date value. Use YYYY-MM-DD.");
  }

  const [rules, transactions, generations] = await Promise.all([
    prisma.recurringRule.findMany({
      include: {
        user: { select: { email: true } },
        category: { select: { specialType: true } },
      },
      orderBy: [{ userId: "asc" }, { createdAt: "asc" }],
    }) as Promise<RuleRow[]>,
    prisma.transaction.findMany({
      where: { recurringRuleId: { not: null } },
      include: {
        user: { select: { email: true } },
        category: { select: { specialType: true } },
        recurringRule: {
          select: {
            id: true,
            categoryId: true,
            category: { select: { specialType: true } },
          },
        },
      },
      orderBy: [{ userId: "asc" }, { date: "asc" }, { createdAt: "asc" }],
    }) as Promise<TransactionRow[]>,
    prisma.recurringGeneration.findMany({
      select: {
        id: true,
        ruleId: true,
        occurrenceDate: true,
        transactionId: true,
      },
      orderBy: [{ ruleId: "asc" }, { occurrenceDate: "asc" }],
    }) as Promise<RecurringGenerationRow[]>,
  ]);

  const filteredRules = rules.filter((row) => matchesUserFilter({ id: row.userId, email: row.user.email }, userId, userEmail));
  const filteredRuleIds = new Set(filteredRules.map((row) => row.id));
  const filteredTransactions = transactions.filter((row) =>
    matchesUserFilter({ id: row.userId, email: row.user.email }, userId, userEmail),
  );
  const filteredGenerations = generations.filter((row) => filteredRuleIds.has(row.ruleId));
  const allTransactionsById = new Map(transactions.map((row) => [row.id, row]));

  const ruleRepairs = filteredRules
    .map((row) => ({
      id: row.id,
      userId: row.userId,
      email: row.user.email,
      before: row.amount,
      after: normalizeRecurringAmount(row.amount, row.categoryId, row.category?.specialType ?? null),
    }))
    .filter((row) => row.before !== row.after);

  const transactionSignRepairs = filteredTransactions
    .map((row) => ({
      id: row.id,
      userId: row.userId,
      email: row.user.email,
      payee: row.payee,
      date: dateKey(row.date),
      before: row.amount,
      after: desiredTransactionAmount(row),
      recurringRuleId: row.recurringRule?.id ?? null,
    }))
    .filter((row) => row.after !== null && row.before !== row.after);

  const skippedTransactions = filteredTransactions
    .filter((row) => desiredTransactionAmount(row) === null)
    .map((row) => ({
      id: row.id,
      userId: row.userId,
      email: row.user.email,
      payee: row.payee,
      date: dateKey(row.date),
      amount: row.amount,
    }));

  const transactionsByRuleAndDate = new Map<string, TransactionRow>();
  for (const row of filteredTransactions) {
    if (!row.recurringRule) {
      continue;
    }
    transactionsByRuleAndDate.set(`${row.recurringRule.id}:${dateKey(row.date)}`, row);
  }

  const generationsByRuleAndDate = new Map<string, RecurringGenerationRow>();
  for (const row of filteredGenerations) {
    generationsByRuleAndDate.set(`${row.ruleId}:${dateKey(row.occurrenceDate)}`, row);
  }

  const generationRepairs: Array<{
    ruleId: string;
    transactionId: string;
    occurrenceDate: string;
    email: string;
  }> = [];
  const generationBackfillRepairs: Array<{
    generationId: string;
    ruleId: string;
    userId: string;
    email: string;
    payee: string;
    occurrenceDate: string;
    amount: number;
    linkedTransactionId: string;
    linkedTransactionDate: string | null;
    linkedTransactionUserId: string | null;
  }> = [];
  const missingOccurrenceRepairs: Array<{
    ruleId: string;
    userId: string;
    email: string;
    payee: string;
    occurrenceDate: string;
    amount: number;
  }> = [];

  for (const rule of filteredRules) {
    const desiredAmount = normalizeRecurringAmount(rule.amount, rule.categoryId, rule.category?.specialType ?? null);

    for (const occurrenceDate of listCandidateOccurrenceDates(rule, throughDate)) {
      const occurrenceKey = `${rule.id}:${dateKey(occurrenceDate)}`;
      const existingTransaction = transactionsByRuleAndDate.get(occurrenceKey);
      const existingGeneration = generationsByRuleAndDate.get(occurrenceKey);
      const linkedTransaction = existingGeneration
        ? allTransactionsById.get(existingGeneration.transactionId) ?? null
        : null;

      if (existingTransaction && !existingGeneration) {
        generationRepairs.push({
          ruleId: rule.id,
          transactionId: existingTransaction.id,
          occurrenceDate: dateKey(occurrenceDate),
          email: rule.user.email,
        });
        continue;
      }

      if (!existingTransaction && existingGeneration) {
        generationBackfillRepairs.push({
          generationId: existingGeneration.id,
          ruleId: rule.id,
          userId: rule.userId,
          email: rule.user.email,
          payee: rule.payee,
          occurrenceDate: dateKey(occurrenceDate),
          amount: desiredAmount,
          linkedTransactionId: existingGeneration.transactionId,
          linkedTransactionDate: linkedTransaction ? dateKey(linkedTransaction.date) : null,
          linkedTransactionUserId: linkedTransaction?.userId ?? null,
        });
        continue;
      }

      if (!existingTransaction && !existingGeneration) {
        missingOccurrenceRepairs.push({
          ruleId: rule.id,
          userId: rule.userId,
          email: rule.user.email,
          payee: rule.payee,
          occurrenceDate: dateKey(occurrenceDate),
          amount: desiredAmount,
        });
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: shouldCommit ? "commit" : "dry-run",
        filters: {
          userId: userId ?? null,
          userEmail: userEmail ?? null,
          throughDate: throughDate.toISOString(),
        },
        recurringRules: {
          signRepairCount: ruleRepairs.length,
          signRepairSample: ruleRepairs.slice(0, 10),
        },
        transactions: {
          signRepairCount: transactionSignRepairs.length,
          signRepairSample: transactionSignRepairs.slice(0, 10),
          generationRepairCount: generationRepairs.length,
          generationRepairSample: generationRepairs.slice(0, 10),
          generationBackfillCount: generationBackfillRepairs.length,
          generationBackfillSample: generationBackfillRepairs.slice(0, 10),
          backfillCount: missingOccurrenceRepairs.length,
          backfillSample: missingOccurrenceRepairs.slice(0, 10),
          skippedCount: skippedTransactions.length,
          skippedSample: skippedTransactions.slice(0, 10),
        },
      },
      null,
      2,
    ),
  );

  if (!shouldCommit) {
    console.log("Dry run only. Re-run with --commit to apply these repairs.");
    return;
  }

  if (
    !ruleRepairs.length &&
    !transactionSignRepairs.length &&
    !generationRepairs.length &&
    !generationBackfillRepairs.length &&
    !missingOccurrenceRepairs.length
  ) {
    console.log("No recurring repairs needed.");
    return;
  }

  const ruleRepairsById = new Map(ruleRepairs.map((row) => [row.id, row]));
  const transactionSignRepairsByRule = new Map<string, typeof transactionSignRepairs>();
  for (const row of transactionSignRepairs) {
    if (!row.recurringRuleId) {
      continue;
    }
    const current = transactionSignRepairsByRule.get(row.recurringRuleId) ?? [];
    current.push(row);
    transactionSignRepairsByRule.set(row.recurringRuleId, current);
  }
  const generationRepairsByRule = new Map<string, typeof generationRepairs>();
  for (const row of generationRepairs) {
    const current = generationRepairsByRule.get(row.ruleId) ?? [];
    current.push(row);
    generationRepairsByRule.set(row.ruleId, current);
  }
  const generationBackfillRepairsByRule = new Map<string, typeof generationBackfillRepairs>();
  for (const row of generationBackfillRepairs) {
    const current = generationBackfillRepairsByRule.get(row.ruleId) ?? [];
    current.push(row);
    generationBackfillRepairsByRule.set(row.ruleId, current);
  }
  const missingOccurrenceRepairsByRule = new Map<string, typeof missingOccurrenceRepairs>();
  for (const row of missingOccurrenceRepairs) {
    const current = missingOccurrenceRepairsByRule.get(row.ruleId) ?? [];
    current.push(row);
    missingOccurrenceRepairsByRule.set(row.ruleId, current);
  }

  for (const rule of filteredRules) {
    const amountRepair = ruleRepairsById.get(rule.id);
    const signFixedAmount = amountRepair?.after ?? normalizeRecurringAmount(rule.amount, rule.categoryId, rule.category?.specialType ?? null);
    const nextRunDate = computeAdvancedNextRunDate(rule, throughDate);
    const signRepairTransactions = transactionSignRepairsByRule.get(rule.id) ?? [];
    const generationRepairRows = generationRepairsByRule.get(rule.id) ?? [];
    const generationBackfillRows = generationBackfillRepairsByRule.get(rule.id) ?? [];
    const missingOccurrenceRows = missingOccurrenceRepairsByRule.get(rule.id) ?? [];

    await prisma.$transaction(async (tx) => {
      if (
        amountRepair ||
        nextRunDate.getTime() !== rule.nextRunDate.getTime() ||
        generationRepairRows.length > 0 ||
        generationBackfillRows.length > 0 ||
        missingOccurrenceRows.length > 0
      ) {
        await tx.recurringRule.update({
          where: { id: rule.id },
          data: {
            amount: signFixedAmount,
            nextRunDate,
            lastGeneratedAt:
              generationRepairRows.length > 0 ||
              generationBackfillRows.length > 0 ||
              missingOccurrenceRows.length > 0 ||
              nextRunDate.getTime() !== rule.nextRunDate.getTime()
                ? new Date()
                : rule.lastGeneratedAt,
          },
        });
      }

      for (const row of signRepairTransactions) {
        await tx.transaction.update({
          where: { id: row.id },
          data: { amount: row.after! },
        });
      }

      for (const row of generationRepairRows) {
        await tx.recurringGeneration.create({
          data: {
            ruleId: row.ruleId,
            occurrenceDate: new Date(`${row.occurrenceDate}T00:00:00.000Z`),
            transactionId: row.transactionId,
          },
        });
      }

      for (const row of generationBackfillRows) {
        if (row.linkedTransactionUserId === rule.userId) {
          await tx.transaction.update({
            where: { id: row.linkedTransactionId },
            data: {
              accountId: rule.accountId,
              categoryId: rule.categoryId,
              recurringRuleId: rule.id,
              date: new Date(`${row.occurrenceDate}T00:00:00.000Z`),
              payee: rule.payee,
              memo: rule.memo,
              amount: signFixedAmount,
              status: rule.status,
            },
          });
          continue;
        }

        const createdTransaction = await tx.transaction.create({
          data: {
            userId: rule.userId,
            accountId: rule.accountId,
            categoryId: rule.categoryId,
            recurringRuleId: rule.id,
            date: new Date(`${row.occurrenceDate}T00:00:00.000Z`),
            payee: rule.payee,
            memo: rule.memo,
            amount: signFixedAmount,
            status: rule.status,
          },
        });

        await tx.recurringGeneration.update({
          where: { id: row.generationId },
          data: { transactionId: createdTransaction.id },
        });
      }

      for (const row of missingOccurrenceRows) {
        const createdTransaction = await tx.transaction.create({
          data: {
            userId: rule.userId,
            accountId: rule.accountId,
            categoryId: rule.categoryId,
            recurringRuleId: rule.id,
            date: new Date(`${row.occurrenceDate}T00:00:00.000Z`),
            payee: rule.payee,
            memo: rule.memo,
            amount: signFixedAmount,
            status: rule.status,
          },
        });

        await tx.recurringGeneration.create({
          data: {
            ruleId: rule.id,
            occurrenceDate: new Date(`${row.occurrenceDate}T00:00:00.000Z`),
            transactionId: createdTransaction.id,
          },
        });
      }
    });
  }

  console.log(
    `Applied ${ruleRepairs.length} rule sign repairs, ${transactionSignRepairs.length} transaction sign repairs, ${generationRepairs.length} generation repairs, ${generationBackfillRepairs.length} generation-linked transaction repairs, and ${missingOccurrenceRepairs.length} backfilled recurring transactions.`,
  );
}

main()
  .catch((error) => {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      console.error("Unable to connect to the database. Check DATABASE_URL and start Postgres before retrying.");
      console.error(error.message);
      process.exitCode = 1;
      return;
    }

    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
