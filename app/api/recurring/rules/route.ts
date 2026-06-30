import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { badRequest, requireApiUser } from "@/lib/server/api";
import { normalizeRecurringAmount } from "@/lib/server/recurring";

async function findRecurringCategory(userId: string, categoryId?: string | null) {
  if (!categoryId) {
    return null;
  }

  return prisma.category.findFirst({
    where: { id: categoryId, userId },
    select: { id: true, specialType: true },
  });
}

function serializeRuleAmount<T extends { amount: number; categoryId: string | null; category?: { specialType: string | null } | null }>(
  rule: T,
) {
  return {
    ...rule,
    amount: normalizeRecurringAmount(rule.amount, rule.categoryId, rule.category?.specialType ?? null),
  };
}

export async function GET() {
  const { user, response } = await requireApiUser();
  if (!user) return response!;

  const rules = await prisma.recurringRule.findMany({
    where: { userId: user.id },
    include: { account: true, category: true },
    orderBy: { nextRunDate: "asc" },
  });

  return NextResponse.json({ rules: rules.map((rule) => serializeRuleAmount(rule)) });
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

  const category = await findRecurringCategory(user.id, body.categoryId);
  if (body.categoryId && !category) {
    return badRequest("Category not found");
  }

  const rule = await prisma.recurringRule.create({
    data: {
      userId: user.id,
      accountId: body.accountId,
      categoryId: body.categoryId,
      payee: body.payee,
      memo: body.memo,
      amount: normalizeRecurringAmount(body.amount, body.categoryId, category?.specialType ?? null),
      status: body.status ?? "UNCLEARED",
      frequency: body.frequency,
      nextRunDate,
      active: body.active ?? true,
    },
    include: { account: true, category: true },
  });

  return NextResponse.json({ rule: serializeRuleAmount(rule) }, { status: 201 });
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

  const effectiveCategoryId = body.categoryId !== undefined ? body.categoryId : existing.categoryId;
  const category = await findRecurringCategory(user.id, effectiveCategoryId);
  if (effectiveCategoryId && !category) {
    return badRequest("Category not found");
  }

  const rule = await prisma.recurringRule.update({
    where: { id: body.id },
    data: {
      ...(body.accountId !== undefined ? { accountId: body.accountId } : {}),
      ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
      ...(body.payee !== undefined ? { payee: body.payee } : {}),
      ...(body.memo !== undefined ? { memo: body.memo } : {}),
      ...(body.amount !== undefined || body.categoryId !== undefined
        ? {
            amount: normalizeRecurringAmount(
              body.amount ?? existing.amount,
              effectiveCategoryId,
              category?.specialType ?? null,
            ),
          }
        : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.frequency !== undefined ? { frequency: body.frequency } : {}),
      ...(nextRunDate ? { nextRunDate } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
    },
    include: { account: true, category: true },
  });

  return NextResponse.json({ rule: serializeRuleAmount(rule) });
}

export async function DELETE(request: Request) {
  const { user, response } = await requireApiUser();
  if (!user) return response!;

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return badRequest("Missing recurring rule id");
  }

  const existing = await prisma.recurringRule.findUnique({ where: { id } });
  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: "Recurring rule not found" }, { status: 404 });
  }

  await prisma.recurringRule.delete({ where: { id } });
  return NextResponse.json({ deleted: true, id });
}
