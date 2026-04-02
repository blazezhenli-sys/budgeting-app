import { currentMonthKey } from "@/lib/month";
import { ReportsView } from "@/lib/components/reports-view";
import { requireSessionUser } from "@/lib/server/auth";
import { getMonthlyReport } from "@/lib/server/reports";
import { ensureSettings, usdRateMapFromSettings } from "@/lib/server/settings";

export default async function ReportsPage() {
  const user = await requireSessionUser();
  const month = currentMonthKey();

  const [report, settings] = await Promise.all([getMonthlyReport(user.id, month), ensureSettings(user.id)]);
  const usdRateMap = usdRateMapFromSettings(settings);

  return (
    <div className="grid">
      <h1>Reports</h1>
      <ReportsView
        initialMonth={month}
        initialReport={report}
        currency={settings.currency}
        usdRateMap={usdRateMap}
      />
    </div>
  );
}
