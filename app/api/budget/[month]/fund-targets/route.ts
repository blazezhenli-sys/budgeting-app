import { NextResponse } from "next/server";

import { isMonthKey } from "@/lib/month";
import { badRequest, requireApiUser } from "@/lib/server/api";
import { quickAutoAssign } from "@/lib/server/budget";
import { budgetAutoAssignSchema } from "@/lib/validation/schemas";

export async function POST(request: Request, context: { params: Promise<{ month: string }> }) {
  const { user, response } = await requireApiUser();
  if (!user) return response!;

  const { month } = await context.params;
  if (!isMonthKey(month)) {
    return badRequest("Invalid month key");
  }

  let parsedBody: unknown = {};
  try {
    const rawBody = await request.text();
    parsedBody = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return badRequest("Invalid auto-assign payload");
  }

  const payload = budgetAutoAssignSchema.safeParse(parsedBody);
  if (!payload.success) {
    return badRequest("Invalid auto-assign payload");
  }

  try {
    const result = await quickAutoAssign(user.id, month, payload.data.mode);
    return NextResponse.json(result);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Failed to auto-assign");
  }
}
