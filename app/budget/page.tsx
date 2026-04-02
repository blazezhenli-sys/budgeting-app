import { redirect } from "next/navigation";

import { currentMonthKey } from "@/lib/month";
import { requireSessionUser } from "@/lib/server/auth";

export default async function BudgetIndexPage() {
  await requireSessionUser();
  redirect(`/budget/${currentMonthKey()}`);
}
