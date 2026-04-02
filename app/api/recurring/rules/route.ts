import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { badRequest, requireApiUser } from "@/lib/server/api";

export async function GET() {
  const { user, response } = await requireApiUser();
  if (!user) return response!;

  const rules = await prisma.recurringRule.findMany({
    where: { userId: user.id },
    include: { account: true, category: true },
    orderBy: { nextRunDate: "asc" },
  });

  return NextResponse.json({ rules });
}

export async function POST(request: Request) {
  const { user, response } = await requireApiUser();
  if (!user) return response!;

  const body = (await request.json()) as {
    accountId?: string;
    categoryId?: string | null;
    payee?: string;
    memo?: string | null;
    amount?: number;
    status?: "CLEARED" | "UNCLEARED";
    frequency?: "WEEKLY" | "MONTHLY";
    nextRunDate?: string;
    active?: boolean;
  };

  if (!body.accountId || !body.payee || !body.amount || !body.frequency || !body.nextRunDate) {
    return badRequest("Missing recurring rule fields");
  }

  const nextRunDate = new Date(body.nextRunDate);
  if (Number.isNaN(nextRunDate.getTime())) {
    return badRequest("Invalid nextRunDate");
  }

  const rule = await prisma.recurringRule.create({
    data: {
      userId: user.id,
      accountId: body.accountId,
      categoryId: body.categoryId,
      payee: body.payee,
      memo: body.memo,
      amount: body.amount,
      status: body.status ?? "UNCLEARED",
      frequency: body.frequency,
      nextRunDate,
      active: body.active ?? true,
    },
  });

  return NextResponse.json({ rule }, { status: 201 });
}

export async function PATCH(request: Request) {
  const { user, response } = await requireApiUser();
  if (!user) return response!;

  const body = (await request.json()) as {
    id?: string;
    accountId?: string;
    categoryId?: string | null;
    payee?: string;
    memo?: string | null;
    amount?: number;
    status?: "CLEARED" | "UNCLEARED";
    frequency?: "WEEKLY" | "MONTHLY";
    nextRunDate?: string;
    active?: boolean;
  };

  if (!body.id) {
    return badRequest("Missing recurring rule id");
  }

  const existing = await prisma.recurringRule.findUnique({ where: { id: body.id } });
  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: "Recurring rule not found" }, { status: 404 });
  }

  const nextRunDate = body.nextRunDate ? new Date(body.nextRunDate) : undefined;
  if (nextRunDate && Number.isNaN(nextRunDate.getTime())) {
    return badRequest("Invalid nextRunDate");
  }

  const rule = await prisma.recurringRule.update({
    where: { id: body.id },
    data: {
      ...(body.accountId !== undefined ? { accountId: body.accountId } : {}),
      ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
      ...(body.payee !== undefined ? { payee: body.payee } : {}),
      ...(body.memo !== undefined ? { memo: body.memo } : {}),
      ...(body.amount !== undefined ? { amount: body.amount } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.frequency !== undefined ? { frequency: body.frequency } : {}),
      ...(nextRunDate ? { nextRunDate } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
    },
  });

  return NextResponse.json({ rule });
}
