import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/server/api";
import { listRecurringQueue } from "@/lib/server/recurring";

export async function GET(request: Request) {
  const { user, response } = await requireApiUser();
  if (!user) return response!;

  const url = new URL(request.url);
  const throughDate = url.searchParams.get("throughDate") ?? undefined;

  const queue = await listRecurringQueue(user.id, throughDate);
  return NextResponse.json({ queue, throughDate: throughDate ?? new Date().toISOString().slice(0, 10) });
}
