import { NextResponse } from "next/server";

import { isMonthKey } from "@/lib/month";
import { requireApiUser } from "@/lib/server/api";
import { getBudgetMonthView } from "@/lib/server/budget";

export async function GET(_request: Request, context: { params: Promise<{ month: string }> }) {
  const { user, response } = await requireApiUser();
  if (!user) return response!;

  const { month } = await context.params;
  if (!isMonthKey(month)) {
    return NextResponse.json({ error: "Invalid month key" }, { status: 400 });
  }

  const budget = await getBudgetMonthView(user.id, month);
  return NextResponse.json({ budget });
}
