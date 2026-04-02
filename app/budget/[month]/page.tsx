import Link from "next/link";
import { addMonths, format, parse } from "date-fns";
import { notFound } from "next/navigation";

import { BudgetBoard } from "@/lib/components/budget-board";
import { prisma } from "@/lib/db";
import { todayInTimeZone } from "@/lib/date";
import { isMonthKey } from "@/lib/month";
import { requireSessionUser } from "@/lib/server/auth";
import { getBudgetMonthView } from "@/lib/server/budget";
import { ensureInflowCategory } from "@/lib/server/inflow";
import { ensureSettings } from "@/lib/server/settings";

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

  const prev = adjacentMonth(month, -1);
  const next = adjacentMonth(month, 1);

  return (
    <div className="grid">
      <div className="inline-row" style={{ justifyContent: "space-between" }}>
        <h1>Budget</h1>
        <div className="inline-row">
          <Link href={`/budget/${prev}`} className="button-link secondary">
            Previous month
          </Link>
          <Link href={`/budget/${next}`} className="button-link secondary">
            Next month
          </Link>
        </div>
      </div>
      <BudgetBoard
        month={month}
        currency={settings.currency}
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
