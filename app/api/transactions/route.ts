import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { isMonthKey, monthBounds } from "@/lib/month";
import { badRequest, requireApiUser } from "@/lib/server/api";
import { ensureInflowCategory } from "@/lib/server/inflow";
import { assertMonthOpenByDate } from "@/lib/server/month-lock";
import { transactionPatchSchema, transactionSchema } from "@/lib/validation/schemas";

export async function GET(request: Request) {
  const { user, response } = await requireApiUser();
  if (!user) return response!;

  const url = new URL(request.url);
  const month = url.searchParams.get("month");
  if (month && !isMonthKey(month)) {
    return badRequest("Invalid month query");
  }
  const monthKey = month && isMonthKey(month) ? month : null;
  const bounds = monthKey ? monthBounds(monthKey) : null;

  const transactions = await prisma.transaction.findMany({
    where: {
      userId: user.id,
      ...(bounds
        ? {
            date: {
              gte: bounds.start,
              lte: bounds.end,
            },
          }
        : {}),
    },
    include: {
      account: true,
      category: true,
      splits: {
        include: { category: true },
      },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ transactions });
}

export async function POST(request: Request) {
  const { user, response } = await requireApiUser();
  if (!user) return response!;

  const payload = transactionSchema.safeParse(await request.json());
  if (!payload.success) {
    return badRequest("Invalid transaction payload");
  }

  const parsedDate = new Date(payload.data.date);
  if (Number.isNaN(parsedDate.getTime())) {
    return badRequest("Invalid transaction date");
  }
  try {
    await assertMonthOpenByDate(user.id, parsedDate);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Cannot edit transactions in closed month");
  }

  if (payload.data.type === "transfer") {
    if (!payload.data.targetAccountId) {
      return badRequest("Transfer transactions require targetAccountId");
    }

    const transferGroup = `transfer-${randomUUID()}`;

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const outgoing = await tx.transaction.create({
        data: {
          userId: user.id,
          accountId: payload.data.accountId,
          date: parsedDate,
          payee: payload.data.payee,
          memo: payload.data.memo,
          amount: payload.data.amount,
          status: payload.data.status,
          transferGroup,
        },
      });

      const incoming = await tx.transaction.create({
        data: {
          userId: user.id,
          accountId: payload.data.targetAccountId!,
          date: parsedDate,
          payee: payload.data.payee,
          memo: payload.data.memo,
          amount: payload.data.amount * -1,
          status: payload.data.status,
          transferGroup,
        },
      });

      return [outgoing, incoming];
    });

    return NextResponse.json({ transactions: result }, { status: 201 });
  }

  if (payload.data.amount < 0 && !payload.data.categoryId) {
    if (!payload.data.splits?.length) {
      return badRequest("Expenses require categoryId unless transaction is a transfer or split");
    }
  }

  const inflowCategory = await ensureInflowCategory(user.id);
  let categoryId = payload.data.categoryId;
  const splits = payload.data.splits ?? [];

  if (payload.data.amount > 0) {
    if (!categoryId) {
      categoryId = inflowCategory.id;
    } else {
      const selectedCategory = await prisma.category.findFirst({
        where: { id: categoryId, userId: user.id },
      });
      if (!selectedCategory) {
        return badRequest("Category not found");
      }
      if (selectedCategory.specialType !== "INFLOW") {
        return badRequest("Income transactions must use the Inflow category");
      }
    }
    if (splits.length) {
      return badRequest("Income transactions cannot be split.");
    }
  } else if (categoryId) {
    const selectedCategory = await prisma.category.findFirst({
      where: { id: categoryId, userId: user.id },
    });
    if (!selectedCategory) {
      return badRequest("Category not found");
    }
  }

  if (splits.length) {
    if (payload.data.amount >= 0) {
      return badRequest("Only expense transactions can be split.");
    }

    const splitCategoryIds = splits.map((split) => split.categoryId);
    const allowedCategories = await prisma.category.findMany({
      where: {
        userId: user.id,
        specialType: null,
        id: { in: splitCategoryIds },
      },
      select: { id: true },
    });
    const allowedIds = new Set(allowedCategories.map((row) => row.id));
    for (const split of splits) {
      if (!allowedIds.has(split.categoryId)) {
        return badRequest("Split category not found");
      }
      if (split.amount >= 0) {
        return badRequest("Split amounts must be negative expense amounts.");
      }
    }

    const splitTotal = splits.reduce((sum, split) => sum + split.amount, 0);
    if (splitTotal !== payload.data.amount) {
      return badRequest("Split amounts must total to the transaction amount.");
    }

    categoryId = null;
  }

  const transaction = await prisma.transaction.create({
    data: {
      userId: user.id,
      accountId: payload.data.accountId,
      categoryId,
      date: parsedDate,
      payee: payload.data.payee,
      memo: payload.data.memo,
      amount: payload.data.amount,
      status: payload.data.status,
      splits: splits.length
        ? {
            create: splits.map((split) => ({
              categoryId: split.categoryId,
              amount: split.amount,
              memo: split.memo ?? null,
            })),
          }
        : undefined,
    },
    include: {
      account: true,
      category: true,
      splits: { include: { category: true } },
    },
  });

  return NextResponse.json({ transaction }, { status: 201 });
}

export async function PATCH(request: Request) {
  const { user, response } = await requireApiUser();
  if (!user) return response!;

  const payload = transactionPatchSchema.safeParse(await request.json());
  if (!payload.success) {
    return badRequest("Invalid transaction patch payload");
  }

  const existing = await prisma.transaction.findUnique({ where: { id: payload.data.id } });
  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  if (existing.transferGroup) {
    return badRequest("Edit transfer transactions by deleting and recreating them");
  }
  const splitCount = await prisma.transactionSplit.count({ where: { transactionId: existing.id } });
  if (splitCount > 0) {
    return badRequest("Edit split transactions by deleting and recreating them");
  }
  try {
    await assertMonthOpenByDate(user.id, existing.date);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Cannot edit transactions in closed month");
  }

  const parsedDate = payload.data.date ? new Date(payload.data.date) : undefined;
  if (parsedDate && Number.isNaN(parsedDate.getTime())) {
    return badRequest("Invalid transaction date");
  }
  if (parsedDate) {
    try {
      await assertMonthOpenByDate(user.id, parsedDate);
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : "Cannot move transactions into closed month");
    }
  }

  const transaction = await prisma.transaction.update({
    where: { id: payload.data.id },
    data: {
      ...(payload.data.accountId !== undefined ? { accountId: payload.data.accountId } : {}),
      ...(payload.data.categoryId !== undefined ? { categoryId: payload.data.categoryId } : {}),
      ...(payload.data.payee !== undefined ? { payee: payload.data.payee } : {}),
      ...(payload.data.memo !== undefined ? { memo: payload.data.memo } : {}),
      ...(payload.data.amount !== undefined ? { amount: payload.data.amount } : {}),
      ...(payload.data.status !== undefined ? { status: payload.data.status } : {}),
      ...(parsedDate ? { date: parsedDate } : {}),
    },
  });

  return NextResponse.json({ transaction });
}

export async function DELETE(request: Request) {
  const { user, response } = await requireApiUser();
  if (!user) return response!;

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return badRequest("Missing transaction id");
  }

  const existing = await prisma.transaction.findUnique({ where: { id } });
  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }
  try {
    await assertMonthOpenByDate(user.id, existing.date);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Cannot delete transactions in closed month");
  }

  if (existing.transferGroup) {
    await prisma.transaction.deleteMany({
      where: {
        userId: user.id,
        transferGroup: existing.transferGroup,
      },
    });

    return NextResponse.json({ deleted: 2, transferGroup: existing.transferGroup });
  }

  await prisma.transaction.delete({ where: { id } });
  return NextResponse.json({ deleted: 1 });
}
