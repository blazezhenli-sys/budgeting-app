import { endOfDay } from "date-fns";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { badRequest, requireApiUser } from "@/lib/server/api";
import { ensureInflowCategory } from "@/lib/server/inflow";
import { assertMonthOpenByDate } from "@/lib/server/month-lock";

type ReconcilePayload = {
  accountId?: string;
  date?: string;
  actualBalance?: number;
  shortfallCategoryId?: string | null;
  memo?: string | null;
};

export async function POST(request: Request) {
  const { user, response } = await requireApiUser();
  if (!user) return response!;

  const body = (await request.json()) as ReconcilePayload;
  if (!body.accountId || !body.date || body.actualBalance === undefined) {
    return badRequest("Missing reconcile fields");
  }

  const parsedDate = new Date(body.date);
  if (Number.isNaN(parsedDate.getTime())) {
    return badRequest("Invalid reconcile date");
  }

  try {
    await assertMonthOpenByDate(user.id, parsedDate);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Cannot reconcile closed month");
  }

  const account = await prisma.account.findFirst({
    where: { id: body.accountId, userId: user.id },
  });
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const ledger = await prisma.transaction.aggregate({
    where: {
      userId: user.id,
      accountId: account.id,
      date: { lte: endOfDay(parsedDate) },
    },
    _sum: { amount: true },
  });

  const ledgerBalance = account.openingBalance + (ledger._sum.amount ?? 0);
  const adjustmentAmount = body.actualBalance - ledgerBalance;

  if (adjustmentAmount === 0) {
    return NextResponse.json({
      reconciled: true,
      changed: false,
      ledgerBalance,
      actualBalance: body.actualBalance,
      adjustmentAmount: 0,
    });
  }

  const inflowCategory = await ensureInflowCategory(user.id);

  let categoryId: string | null = null;
  if (adjustmentAmount > 0) {
    categoryId = inflowCategory.id;
  } else {
    if (!body.shortfallCategoryId) {
      return badRequest("Negative reconcile adjustments require a shortfall category.");
    }
    const shortfallCategory = await prisma.category.findFirst({
      where: {
        id: body.shortfallCategoryId,
        userId: user.id,
        specialType: null,
      },
    });
    if (!shortfallCategory) {
      return badRequest("Shortfall category not found");
    }
    categoryId = shortfallCategory.id;
  }

  const transaction = await prisma.transaction.create({
    data: {
      userId: user.id,
      accountId: account.id,
      date: parsedDate,
      payee: "Reconciliation Adjustment",
      memo: body.memo ?? "Balance reconciliation",
      amount: adjustmentAmount,
      status: "UNCLEARED",
      categoryId,
    },
  });

  return NextResponse.json({
    reconciled: true,
    changed: true,
    ledgerBalance,
    actualBalance: body.actualBalance,
    adjustmentAmount,
    transaction,
  });
}
