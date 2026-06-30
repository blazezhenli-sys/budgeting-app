import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normalizeRecurringAmount(amount: number, categoryId?: string | null, categorySpecialType?: string | null): number {
  const absoluteAmount = Math.abs(amount);

  if (!categoryId || categorySpecialType === "INFLOW") {
    return absoluteAmount;
  }

  return absoluteAmount * -1;
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
  amount: number;
  categoryId: string | null;
  user: { email: string };
  category: { specialType: string | null } | null;
};

type TransactionRow = {
  id: string;
  userId: string;
  amount: number;
  categoryId: string | null;
  payee: string;
  date: Date;
  user: { email: string };
  category: { specialType: string | null } | null;
  recurringRule: {
    id: string;
    categoryId: string | null;
    category: { specialType: string | null } | null;
  } | null;
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

async function main() {
  const shouldCommit = readFlag("--commit");
  const userId = readArgValue("--user-id=");
  const userEmail = readArgValue("--user-email=");

  const [rules, transactions] = await Promise.all([
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
  ]);

  const ruleRepairs = rules
    .filter((row) => matchesUserFilter({ id: row.userId, email: row.user.email }, userId, userEmail))
    .map((row) => ({
      id: row.id,
      userId: row.userId,
      email: row.user.email,
      before: row.amount,
      after: normalizeRecurringAmount(row.amount, row.categoryId, row.category?.specialType ?? null),
    }))
    .filter((row) => row.before !== row.after);

  const transactionRepairs = transactions
    .filter((row) => matchesUserFilter({ id: row.userId, email: row.user.email }, userId, userEmail))
    .map((row) => ({
      id: row.id,
      userId: row.userId,
      email: row.user.email,
      payee: row.payee,
      date: row.date.toISOString().slice(0, 10),
      before: row.amount,
      after: desiredTransactionAmount(row),
    }))
    .filter((row) => row.after !== null && row.before !== row.after);

  const skippedTransactions = transactions
    .filter((row) => matchesUserFilter({ id: row.userId, email: row.user.email }, userId, userEmail))
    .filter((row) => desiredTransactionAmount(row) === null)
    .map((row) => ({
      id: row.id,
      userId: row.userId,
      email: row.user.email,
      payee: row.payee,
      date: row.date.toISOString().slice(0, 10),
      amount: row.amount,
    }));

  console.log(
    JSON.stringify(
      {
        mode: shouldCommit ? "commit" : "dry-run",
        filters: {
          userId: userId ?? null,
          userEmail: userEmail ?? null,
        },
        recurringRules: {
          repairCount: ruleRepairs.length,
          sample: ruleRepairs.slice(0, 10),
        },
        transactions: {
          repairCount: transactionRepairs.length,
          sample: transactionRepairs.slice(0, 10),
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

  if (!ruleRepairs.length && !transactionRepairs.length) {
    console.log("No recurring sign repairs needed.");
    return;
  }

  await prisma.$transaction([
    ...ruleRepairs.map((row) =>
      prisma.recurringRule.update({
        where: { id: row.id },
        data: { amount: row.after },
      }),
    ),
    ...transactionRepairs.map((row) =>
      prisma.transaction.update({
        where: { id: row.id },
        data: { amount: row.after! },
      }),
    ),
  ]);

  console.log(
    `Applied ${ruleRepairs.length} recurring rule repairs and ${transactionRepairs.length} recurring transaction repairs.`,
  );
}

main()
  .catch((error) => {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      console.error(`Unable to connect to the database. Check DATABASE_URL and start Postgres before retrying.`);
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
