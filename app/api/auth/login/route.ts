import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { createSessionToken, sessionCookieConfig, verifyPassword } from "@/lib/server/auth";
import { loginSchema } from "@/lib/validation/schemas";

export async function POST(request: Request) {
  const payload = loginSchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
  }

  const requestedEmail = payload.data.email.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: requestedEmail }, { secondaryEmail: requestedEmail }],
    },
  });
  if (!user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const primaryEmail = user.email.toLowerCase();
  const secondaryEmail = user.secondaryEmail?.toLowerCase() ?? null;

  const passwordHash =
    requestedEmail === primaryEmail
      ? user.passwordHash
      : requestedEmail === secondaryEmail
        ? user.secondaryPasswordHash
        : null;

  if (!passwordHash) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const validPassword = await verifyPassword(payload.data.password, passwordHash);
  if (!validPassword) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await createSessionToken(user.id);
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: sessionCookieConfig.name,
    value: token,
    httpOnly: true,
    maxAge: sessionCookieConfig.maxAge,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return response;
}
