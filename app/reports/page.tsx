import { currentMonthKey } from "@/lib/month";
import { ReportsView } from "@/lib/components/reports-view";
import { requireSessionUser } from "@/lib/server/auth";
import { getBudgetMonthView } from "@/lib/server/budget";
import { ensureSettings } from "@/lib/server/settings";

export default async function ReportsPage() {
  const user = await requireSessionUser();
  const month = currentMonthKey();

  const [budget, settings] = await Promise.all([getBudgetMonthView(user.id, month), ensureSettings(user.id)]);

  return (
    <div className="grid">
      <h1>Reports</h1>
      <ReportsView
        initialMonth={month}
        initialReport={{
          month,
          totals: budget.totals,
          categorySummary: budget.categories,
          warnings: budget.warnings,
        }}
        currency={settings.currency}
      />
    </div>
  );
}
