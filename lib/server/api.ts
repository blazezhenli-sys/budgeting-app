import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/server/auth";

export async function requireApiUser() {
  const user = await getSessionUser();
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { user, response: null as NextResponse | null };
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}
