import { NextResponse } from "next/server";

import { isMonthKey } from "@/lib/month";
import { requireApiUser } from "@/lib/server/api";
import { getBudgetMonthView } from "@/lib/server/budget";

export async function GET(request: Request) {
  const { user, response } = await requireApiUser();
  if (!user) return response!;

  const url = new URL(request.url);
  const month = url.searchParams.get("month");
  if (!month || !isMonthKey(month)) {
    return NextResponse.json({ error: "month query must be YYYY-MM" }, { status: 400 });
  }

  const budget = await getBudgetMonthView(user.id, month);
  return NextResponse.json({
    month,
    totals: budget.totals,
    categorySummary: budget.categories,
    warnings: budget.warnings,
  });
}
