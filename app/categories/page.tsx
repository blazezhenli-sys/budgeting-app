import { redirect } from "next/navigation";

import { todayInTimeZone } from "@/lib/date";
import { requireSessionUser } from "@/lib/server/auth";
import { ensureSettings } from "@/lib/server/settings";

export default async function CategoriesPage() {
  const user = await requireSessionUser();
  const settings = await ensureSettings(user.id);
  const currentMonth = todayInTimeZone(settings.timezone).slice(0, 7);
  redirect(`/budget/${currentMonth}?modal=categories`);
}
