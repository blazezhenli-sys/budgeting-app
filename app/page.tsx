import { redirect } from "next/navigation";

import { currentMonthKey } from "@/lib/month";
import { getSessionUser } from "@/lib/server/auth";

export default async function Home() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  redirect(`/budget/${currentMonthKey()}`);
}
