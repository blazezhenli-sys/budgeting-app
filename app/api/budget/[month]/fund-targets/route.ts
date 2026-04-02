import { NextResponse } from "next/server";

import { isMonthKey } from "@/lib/month";
import { badRequest, requireApiUser } from "@/lib/server/api";
import { quickFundMonthlyTargets } from "@/lib/server/budget";

export async function POST(_request: Request, context: { params: Promise<{ month: string }> }) {
  const { user, response } = await requireApiUser();
  if (!user) return response!;

  const { month } = await context.params;
  if (!isMonthKey(month)) {
    return badRequest("Invalid month key");
  }

  try {
    const result = await quickFundMonthlyTargets(user.id, month);
    return NextResponse.json(result);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Failed to fund targets");
  }
}
