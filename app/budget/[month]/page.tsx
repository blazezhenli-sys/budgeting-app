import Link from "next/link";
import { addMonths, format, parse } from "date-fns";
import { notFound } from "next/navigation";

import { BudgetWorkspace } from "@/lib/components/budget-workspace";
import { prisma } from "@/lib/db";
import { todayInTimeZone } from "@/lib/date";
import { isMonthKey } from "@/lib/month";
import { requireSessionUser } from "@/lib/server/auth";
import { getBudgetMonthView } from "@/lib/server/budget";
import { ensureInflowCategory } from "@/lib/server/inflow";
import { ensureSettings, usdRateMapFromSettings } from "@/lib/server/settings";

function adjacentMonth(month: string, offset: number): string {
  const parsed = parse(`${month}-01`, "yyyy-MM-dd", new Date());
  return format(addMonths(parsed, offset), "yyyy-MM");
}

export default async function BudgetMonthPage({ params }: { params: Promise<{ month: string }> }) {
  const user = await requireSessionUser();
  const { month } = await params;
  if (!isMonthKey(month)) {
    notFound();
  }
  await ensureInflowCategory(user.id);

  const [settings, budget, accounts, categories] = await Promise.all([
    ensureSettings(user.id),
    getBudgetMonthView(user.id, month),
    prisma.account.findMany({ where: { userId: user.id, archived: false }, orderBy: { name: "asc" } }),
    prisma.category.findMany({
      where: { userId: user.id, archived: false },
      orderBy: { name: "asc" },
    }),
  ]);
  const inflowCategory = categories.find((category) => category.specialType === "INFLOW");
  const initialQuickDate = todayInTimeZone(settings.timezone);
  const usdRateMap = usdRateMapFromSettings(settings);
  const monthLabel = format(parse(`${month}-01`, "yyyy-MM-dd", new Date()), "MMMM yyyy");

  const prev = adjacentMonth(month, -1);
  const next = adjacentMonth(month, 1);

  return (
    <div className="budget-page">
      <nav className="budget-page__breadcrumb" aria-label="Budget section">
        <Link href="/budget">Budget</Link>
        <span>/</span>
        <span>{monthLabel}</span>
      </nav>
      <BudgetWorkspace
        month={month}
        monthLabel={monthLabel}
        prevMonthHref={`/budget/${prev}`}
        nextMonthHref={`/budget/${next}`}
        currency={settings.currency}
        usdRateMap={usdRateMap}
        initialBudget={budget}
        accounts={accounts}
        categories={categories}
        inflowCategoryId={inflowCategory?.id ?? null}
        inflowCategoryName={inflowCategory?.name ?? "Inflow: Ready to Assign"}
        initialQuickDate={initialQuickDate}
      />
    </div>
  );
}
