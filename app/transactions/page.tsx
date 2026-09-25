import { TransactionsManager } from "@/lib/components/transactions-manager";
import { prisma } from "@/lib/db";
import { todayInTimeZone } from "@/lib/date";
import { monthBounds } from "@/lib/month";
import { requireSessionUser } from "@/lib/server/auth";
import { ensureInflowCategory } from "@/lib/server/inflow";
import { ensureSettings, usdRateMapFromSettings } from "@/lib/server/settings";
import type { MonthKey } from "@/lib/types";

function readSingleParam(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value ? value : null;
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string | string[] }>;
}) {
  const user = await requireSessionUser();
  await ensureInflowCategory(user.id);
  const query = await searchParams;

  const settings = await ensureSettings(user.id);
  const initialDate = todayInTimeZone(settings.timezone);
  const initialMonth = initialDate.slice(0, 7) as MonthKey;
  const bounds = monthBounds(initialMonth);
  const requestedAccountId = readSingleParam(query.accountId);

  const [accounts, categories] = await Promise.all([
    prisma.account.findMany({ where: { userId: user.id, archived: false }, orderBy: { name: "asc" } }),
    prisma.category.findMany({
      where: { userId: user.id, archived: false },
      orderBy: [{ group: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  const selectedAccount = requestedAccountId
    ? accounts.find((account) => account.id === requestedAccountId) ?? null
    : null;

  const transactions = await prisma.transaction.findMany({
    where: {
      userId: user.id,
      date: {
        gte: bounds.start,
        lte: bounds.end,
      },
      ...(selectedAccount ? { accountId: selectedAccount.id } : {}),
    },
    include: {
      account: true,
      category: true,
      splits: {
        include: { category: true },
      },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  const serializableTransactions = transactions.map((row) => ({
    id: row.id,
    date: row.date.toISOString(),
    payee: row.payee,
    memo: row.memo,
    amount: row.amount,
    status: row.status,
    transferGroup: row.transferGroup,
    account: { id: row.account.id, name: row.account.name },
    categoryId: row.categoryId,
    category: row.category ? { id: row.category.id, name: row.category.name } : null,
    splits: row.splits.map((split) => ({
      id: split.id,
      amount: split.amount,
      memo: split.memo,
      category: { name: split.category.name },
    })),
  }));
  const inflowCategory = categories.find((category) => category.specialType === "INFLOW");
  const usdRateMap = usdRateMapFromSettings(settings);

  return (
    <div className="grid">
      <h1>{selectedAccount ? `${selectedAccount.name} Register` : "Transactions"}</h1>
      <TransactionsManager
        initialTransactions={serializableTransactions}
        accounts={accounts}
        categories={categories}
        inflowCategoryId={inflowCategory?.id ?? null}
        currency={settings.currency}
        usdRateMap={usdRateMap}
        initialDate={initialDate}
        initialMonth={initialMonth}
        initialAccountFilterId={selectedAccount?.id ?? null}
      />
    </div>
  );
}
