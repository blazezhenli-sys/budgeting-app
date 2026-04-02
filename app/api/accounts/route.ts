import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { badRequest, requireApiUser } from "@/lib/server/api";
import { accountPatchSchema, accountSchema } from "@/lib/validation/schemas";

export async function GET() {
  const { user, response } = await requireApiUser();
  if (!user) return response!;

  const accounts = await prisma.account.findMany({
    where: { userId: user.id },
    include: {
      _count: {
        select: {
          transactions: true,
          recurringRules: true,
        },
      },
    },
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
    include: {
      _count: {
        select: {
          transactions: true,
          recurringRules: true,
        },
      },
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
    include: {
      _count: {
        select: {
          transactions: true,
          recurringRules: true,
        },
      },
    },
  });

  return NextResponse.json({ account });
}

export async function DELETE(request: Request) {
  const { user, response } = await requireApiUser();
  if (!user) return response!;

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return badRequest("Missing account id");
  }

  const account = await prisma.account.findFirst({
    where: { id, userId: user.id },
    include: {
      _count: {
        select: {
          transactions: true,
          recurringRules: true,
        },
      },
    },
  });

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  if (account._count.transactions > 0 || account._count.recurringRules > 0) {
    return NextResponse.json(
      {
        error: "Cannot delete account with existing transactions or recurring rules",
        dependencies: {
          transactions: account._count.transactions,
          recurringRules: account._count.recurringRules,
        },
      },
      { status: 409 },
    );
  }

  await prisma.account.delete({ where: { id: account.id } });
  return NextResponse.json({ deleted: true, id: account.id });
}
