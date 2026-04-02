import { SettingsManager } from "@/lib/components/settings-manager";
import { prisma } from "@/lib/db";
import { todayInTimeZone } from "@/lib/date";
import { requireSessionUser } from "@/lib/server/auth";
import { ensureInflowCategory } from "@/lib/server/inflow";
import { listRecurringQueue } from "@/lib/server/recurring";
import { ensureSettings } from "@/lib/server/settings";

export default async function SettingsPage() {
  const user = await requireSessionUser();
  await ensureInflowCategory(user.id);

  const [settings, rules, accounts, categories, queue] = await Promise.all([
    ensureSettings(user.id),
    prisma.recurringRule.findMany({
      where: { userId: user.id },
      include: { account: true, category: true },
      orderBy: { nextRunDate: "asc" },
    }),
    prisma.account.findMany({ where: { userId: user.id, archived: false }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ where: { userId: user.id, archived: false }, orderBy: { name: "asc" } }),
    listRecurringQueue(user.id),
  ]);
  const initialRuleDate = todayInTimeZone(settings.timezone);

  return (
    <div className="grid">
      <h1>Settings & Recurring</h1>
      <SettingsManager
        initialSettings={settings}
        rules={rules}
        accounts={accounts}
        categories={categories}
        initialQueue={queue}
        initialRuleDate={initialRuleDate}
      />
    </div>
  );
}
