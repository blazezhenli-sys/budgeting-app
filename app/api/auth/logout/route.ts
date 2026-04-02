import { NextResponse } from "next/server";

import { sessionCookieConfig } from "@/lib/server/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: sessionCookieConfig.name,
    value: "",
    maxAge: 0,
    path: "/",
  });
  return response;
}
