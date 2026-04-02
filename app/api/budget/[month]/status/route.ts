import { NextResponse } from "next/server";

import { isMonthKey } from "@/lib/month";
import { badRequest, requireApiUser } from "@/lib/server/api";
import { getBudgetMonthView, setBudgetMonthStatus } from "@/lib/server/budget";
import { budgetMonthStatusSchema } from "@/lib/validation/schemas";

export async function GET(_request: Request, context: { params: Promise<{ month: string }> }) {
  const { user, response } = await requireApiUser();
  if (!user) return response!;

  const { month } = await context.params;
  if (!isMonthKey(month)) {
    return badRequest("Invalid month key");
  }

  const budget = await getBudgetMonthView(user.id, month);
  return NextResponse.json({ month, status: budget.status });
}

export async function PUT(request: Request, context: { params: Promise<{ month: string }> }) {
  const { user, response } = await requireApiUser();
  if (!user) return response!;

  const { month } = await context.params;
  if (!isMonthKey(month)) {
    return badRequest("Invalid month key");
  }

  const payload = budgetMonthStatusSchema.safeParse(await request.json());
  if (!payload.success || payload.data.month !== month) {
    return badRequest("Invalid month status payload");
  }

  await setBudgetMonthStatus(user.id, month, payload.data.status);
  const budget = await getBudgetMonthView(user.id, month);
  return NextResponse.json({ month, status: budget.status, budget });
}
