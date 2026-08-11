import { NextResponse } from "next/server";

import { badRequest, requireApiUser } from "@/lib/server/api";
import { todayInTimeZone } from "@/lib/date";
import { listRecurringQueue } from "@/lib/server/recurring";
import { ensureSettings } from "@/lib/server/settings";

export async function GET(request: Request) {
  const { user, response } = await requireApiUser();
  if (!user) return response!;

  const url = new URL(request.url);
  const throughDate = url.searchParams.get("throughDate") ?? undefined;
  if (throughDate && !/^\d{4}-\d{2}-\d{2}$/.test(throughDate)) {
    return badRequest("Invalid throughDate query");
  }

  const [queue, settings] = await Promise.all([listRecurringQueue(user.id, throughDate), ensureSettings(user.id)]);
  return NextResponse.json({ queue, throughDate: throughDate ?? todayInTimeZone(settings.timezone) });
}
