import Link from "next/link";
import { notFound } from "next/navigation";

import { TransactionsManager } from "@/lib/components/transactions-manager";
import { prisma } from "@/lib/db";
import { todayInTimeZone } from "@/lib/date";
import { formatUsdMoney } from "@/lib/money";
import { monthBounds } from "@/lib/month";
import { requireSessionUser } from "@/lib/server/auth";
import { ensureInflowCategory } from "@/lib/server/inflow";
import { ensureSettings, usdRateMapFromSettings } from "@/lib/server/settings";
import type { MonthKey } from "@/lib/types";

export default async function AccountRegisterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireSessionUser();
  await ensureInflowCategory(user.id);
  const { id } = await params;

  const settings = await ensureSettings(user.id);
  const initialDate = todayInTimeZone(settings.timezone);
  const initialMonth = initialDate.slice(0, 7) as MonthKey;
  const bounds = monthBounds(initialMonth);

  const [accounts, categories, sums, transactions] = await Promise.all([
    prisma.account.findMany({
      where: { userId: user.id, archived: false },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({
      where: { userId: user.id, archived: false },
      orderBy: [{ group: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.transaction.aggregate({
      where: { userId: user.id, accountId: id },
      _sum: { amount: true },
    }),
    prisma.transaction.findMany({
      where: {
        userId: user.id,
        accountId: id,
        date: {
          gte: bounds.start,
          lte: bounds.end,
        },
      },
      include: {
        account: true,
        category: true,
        splits: {
          include: { category: true },
        },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
  ]);
  const account = accounts.find((item) => item.id === id) ?? null;

  if (!account) {
    notFound();
  }

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
  const currentBalance = account.openingBalance + (sums._sum.amount ?? 0);

  return (
    <div className="grid">
      <nav className="budget-page__breadcrumb" aria-label="Account register">
        <Link href="/accounts">Accounts</Link>
        <span>/</span>
        <span>{account.name}</span>
      </nav>

      <section className="account-register-header">
        <div>
          <h1>{account.name}</h1>
          <p className="muted">{account.type} account register</p>
        </div>
        <div className="account-register-header__stats">
          <div className="account-register-header__stat">
            <span className="muted">Opening</span>
            <strong>{formatUsdMoney(account.openingBalance, settings.currency, usdRateMap)}</strong>
          </div>
          <div className="account-register-header__stat">
            <span className="muted">Current</span>
            <strong>{formatUsdMoney(currentBalance, settings.currency, usdRateMap)}</strong>
          </div>
        </div>
      </section>

      <TransactionsManager
        initialTransactions={serializableTransactions}
        accounts={accounts}
        categories={categories}
        inflowCategoryId={inflowCategory?.id ?? null}
        currency={settings.currency}
        usdRateMap={usdRateMap}
        initialDate={initialDate}
        initialMonth={initialMonth}
        initialAccountFilterId={account.id}
        fixedAccountId={account.id}
      />
    </div>
  );
}
