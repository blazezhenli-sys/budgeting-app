import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { badRequest, requireApiUser } from "@/lib/server/api";
import { accountPatchSchema, accountSchema } from "@/lib/validation/schemas";

export async function GET() {
  const { user, response } = await requireApiUser();
  if (!user) return response!;

  const accounts = await prisma.account.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ accounts });
}

export async function POST(request: Request) {
  const { user, response } = await requireApiUser();
  if (!user) return response!;

  const payload = accountSchema.safeParse(await request.json());
  if (!payload.success) {
    return badRequest("Invalid account payload");
  }

  const account = await prisma.account.create({
    data: {
      userId: user.id,
      name: payload.data.name,
      type: payload.data.type,
      openingBalance: payload.data.openingBalance ?? 0,
      archived: payload.data.archived ?? false,
    },
  });

  return NextResponse.json({ account }, { status: 201 });
}

export async function PATCH(request: Request) {
  const { user, response } = await requireApiUser();
  if (!user) return response!;

  const payload = accountPatchSchema.safeParse(await request.json());
  if (!payload.success) {
    return badRequest("Invalid account patch payload");
  }

  const existing = await prisma.account.findFirst({
    where: { id: payload.data.id, userId: user.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const account = await prisma.account.update({
    where: { id: payload.data.id },
    data: {
      ...(payload.data.name !== undefined ? { name: payload.data.name } : {}),
      ...(payload.data.type !== undefined ? { type: payload.data.type } : {}),
      ...(payload.data.openingBalance !== undefined ? { openingBalance: payload.data.openingBalance } : {}),
      ...(payload.data.archived !== undefined ? { archived: payload.data.archived } : {}),
    },
  });

  return NextResponse.json({ account });
}
