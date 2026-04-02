import { AccountsManager } from "@/lib/components/accounts-manager";
import { prisma } from "@/lib/db";
import { todayInTimeZone } from "@/lib/date";
import { requireSessionUser } from "@/lib/server/auth";
import { ensureInflowCategory } from "@/lib/server/inflow";
import { ensureSettings } from "@/lib/server/settings";

export default async function AccountsPage() {
  const user = await requireSessionUser();
  await ensureInflowCategory(user.id);

  const [accounts, settings, categories, sums] = await Promise.all([
    prisma.account.findMany({
      where: { userId: user.id },
      include: {
        _count: {
          select: {
            transactions: true,
            recurringRules: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    ensureSettings(user.id),
    prisma.category.findMany({
      where: { userId: user.id, specialType: null, archived: false },
      orderBy: { name: "asc" },
    }),
    prisma.transaction.groupBy({
      by: ["accountId"],
      where: { userId: user.id },
      _sum: { amount: true },
    }),
  ]);
  const sumsByAccount = new Map(sums.map((row) => [row.accountId, row._sum.amount ?? 0]));
  const balances = Object.fromEntries(
    accounts.map((account) => [account.id, account.openingBalance + (sumsByAccount.get(account.id) ?? 0)]),
  );
  const initialDate = todayInTimeZone(settings.timezone);

  return (
    <div className="grid">
      <h1>Accounts</h1>
      <AccountsManager
        initialAccounts={accounts}
        initialBalances={balances}
        categories={categories}
        currency={settings.currency}
        initialReconcileDate={initialDate}
      />
    </div>
  );
}
