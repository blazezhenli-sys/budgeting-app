import { TransactionsManager } from "@/lib/components/transactions-manager";
import { prisma } from "@/lib/db";
import { todayInTimeZone } from "@/lib/date";
import { requireSessionUser } from "@/lib/server/auth";
import { ensureInflowCategory } from "@/lib/server/inflow";
import { ensureSettings, usdRateMapFromSettings } from "@/lib/server/settings";

export default async function TransactionsPage() {
  const user = await requireSessionUser();
  await ensureInflowCategory(user.id);

  const [accounts, categories, transactions, settings] = await Promise.all([
    prisma.account.findMany({ where: { userId: user.id, archived: false }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ where: { userId: user.id, archived: false }, orderBy: { name: "asc" } }),
    prisma.transaction.findMany({
      where: { userId: user.id },
      include: {
        account: true,
        category: true,
        splits: {
          include: { category: true },
        },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 200,
    }),
    ensureSettings(user.id),
  ]);

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
  const initialDate = todayInTimeZone(settings.timezone);
  const usdRateMap = usdRateMapFromSettings(settings);

  return (
    <div className="grid">
      <h1>Transactions</h1>
      <TransactionsManager
        initialTransactions={serializableTransactions}
        accounts={accounts}
        categories={categories}
        inflowCategoryId={inflowCategory?.id ?? null}
        currency={settings.currency}
        usdRateMap={usdRateMap}
        initialDate={initialDate}
      />
    </div>
  );
}
