import { NextResponse } from "next/server";

import { isMonthKey } from "@/lib/month";
import { badRequest, requireApiUser } from "@/lib/server/api";
import { upsertBudgetAssignments } from "@/lib/server/budget";
import { budgetAssignmentSchema } from "@/lib/validation/schemas";

export async function PUT(request: Request, context: { params: Promise<{ month: string }> }) {
  const { user, response } = await requireApiUser();
  if (!user) return response!;

  const { month } = await context.params;
  if (!isMonthKey(month)) {
    return badRequest("Invalid month key");
  }

  const payload = budgetAssignmentSchema.safeParse(await request.json());
  if (!payload.success || payload.data.month !== month) {
    return badRequest("Invalid budget assignment payload");
  }

  try {
    const budget = await upsertBudgetAssignments(user.id, month, payload.data.assignments);
    return NextResponse.json({ budget });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update assignments";
    return badRequest(message);
  }
}
