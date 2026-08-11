import { NextResponse } from "next/server";

import { isMonthKey } from "@/lib/month";
import { badRequest, requireApiUser } from "@/lib/server/api";
import { coverOverspendingFromCategory } from "@/lib/server/budget";
import { budgetCoverOverspendingSchema } from "@/lib/validation/schemas";

export async function POST(request: Request, context: { params: Promise<{ month: string }> }) {
  const { user, response } = await requireApiUser();
  if (!user) return response!;

  const { month } = await context.params;
  if (!isMonthKey(month)) {
    return badRequest("Invalid month key");
  }

  const payload = budgetCoverOverspendingSchema.safeParse(await request.json());
  if (!payload.success || payload.data.month !== month) {
    return badRequest("Invalid cover overspending payload");
  }

  try {
    const result = await coverOverspendingFromCategory(
      user.id,
      month,
      payload.data.overspentCategoryId,
      payload.data.sourceCategoryId,
    );
    return NextResponse.json(result);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Failed to cover overspending");
  }
}
