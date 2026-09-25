import Link from "next/link";
import { addMonths, endOfMonth, format, parse } from "date-fns";
import { notFound } from "next/navigation";

import { BudgetWorkspace } from "@/lib/components/budget-workspace";
import { prisma } from "@/lib/db";
import { todayInTimeZone } from "@/lib/date";
import { isMonthKey } from "@/lib/month";
import { requireSessionUser } from "@/lib/server/auth";
import { getBudgetMonthView } from "@/lib/server/budget";
import { ensureInflowCategory } from "@/lib/server/inflow";
import { listRecurringQueue } from "@/lib/server/recurring";
import { ensureSettings, usdRateMapFromSettings } from "@/lib/server/settings";

function adjacentMonth(month: string, offset: number): string {
  const parsed = parse(`${month}-01`, "yyyy-MM-dd", new Date());
  return format(addMonths(parsed, offset), "yyyy-MM");
}

function readModalParam(value: string | string[] | undefined): "quick-add" | "categories" | null {
  if (typeof value !== "string") {
    return null;
  }

  if (value === "quick-add" || value === "categories") {
    return value;
  }

  return null;
}

export default async function BudgetMonthPage({
  params,
  searchParams,
}: {
  params: Promise<{ month: string }>;
  searchParams: Promise<{ modal?: string | string[] }>;
}) {
  const user = await requireSessionUser();
  const { month } = await params;
  const query = await searchParams;
  if (!isMonthKey(month)) {
    notFound();
  }
  await ensureInflowCategory(user.id);
  const monthStart = parse(`${month}-01`, "yyyy-MM-dd", new Date());
  const recurringThroughDate = format(endOfMonth(monthStart), "yyyy-MM-dd");

  const [settings, budget, accounts, categoryGroups, categories, recurringQueue] = await Promise.all([
    ensureSettings(user.id),
    getBudgetMonthView(user.id, month),
    prisma.account.findMany({ where: { userId: user.id, archived: false }, orderBy: { name: "asc" } }),
    prisma.categoryGroup.findMany({
      where: { userId: user.id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.category.findMany({
      where: { userId: user.id, archived: false },
      orderBy: [{ group: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    listRecurringQueue(user.id, recurringThroughDate),
  ]);
  const inflowCategory = categories.find((category) => category.specialType === "INFLOW");
  const initialQuickDate = todayInTimeZone(settings.timezone);
  const usdRateMap = usdRateMapFromSettings(settings);
  const monthLabel = format(monthStart, "MMMM yyyy");
  const monthRecurringQueue = recurringQueue.filter((item) => item.nextRunDate.startsWith(`${month}-`));

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
        categoryGroups={categoryGroups}
        categories={categories}
        inflowCategoryId={inflowCategory?.id ?? null}
        inflowCategoryName={inflowCategory?.name ?? "Inflow: Ready to Assign"}
        initialQuickDate={initialQuickDate}
        initialRecurringQueue={monthRecurringQueue}
        recurringThroughDate={recurringThroughDate}
        initialModal={readModalParam(query.modal)}
      />
    </div>
  );
}
