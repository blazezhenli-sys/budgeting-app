import { NextResponse } from "next/server";

import { badRequest, requireApiUser } from "@/lib/server/api";
import { generateRecurringTransactions } from "@/lib/server/recurring";
import { recurringGenerateSchema } from "@/lib/validation/schemas";

export async function POST(request: Request) {
  const { user, response } = await requireApiUser();
  if (!user) return response!;

  const payload = recurringGenerateSchema.safeParse(await request.json());
  if (!payload.success) {
    return badRequest("Invalid recurring generation payload");
  }

  const result = await generateRecurringTransactions(user.id, payload.data.throughDate, {
    ruleIds: payload.data.ruleIds,
  });
  return NextResponse.json(result);
}
