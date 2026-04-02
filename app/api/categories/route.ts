import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { badRequest, requireApiUser } from "@/lib/server/api";
import { ensureInflowCategory } from "@/lib/server/inflow";
import { categoryGroupSchema, categoryPatchSchema, categorySchema } from "@/lib/validation/schemas";

export async function GET() {
  const { user, response } = await requireApiUser();
  if (!user) return response!;

  await ensureInflowCategory(user.id);

  const [groups, categories] = await Promise.all([
    prisma.categoryGroup.findMany({
      where: { userId: user.id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.category.findMany({
      where: { userId: user.id },
      orderBy: { name: "asc" },
    }),
  ]);

  return NextResponse.json({ groups, categories });
}

export async function POST(request: Request) {
  const { user, response } = await requireApiUser();
  if (!user) return response!;

  const body = await request.json();

  if (body.kind === "group") {
    const payload = categoryGroupSchema.safeParse(body);
    if (!payload.success) {
      return badRequest("Invalid category group payload");
    }

    const group = await prisma.categoryGroup.create({
      data: {
        userId: user.id,
        name: payload.data.name,
        sortOrder: payload.data.sortOrder ?? 0,
        archived: payload.data.archived ?? false,
      },
    });

    return NextResponse.json({ group }, { status: 201 });
  }

  const payload = categorySchema.safeParse(body);
  if (!payload.success) {
    return badRequest("Invalid category payload");
  }

  const category = await prisma.category.create({
    data: {
      userId: user.id,
      groupId: payload.data.groupId,
      name: payload.data.name,
      targetMonthly: payload.data.targetMonthly ?? null,
      archived: payload.data.archived ?? false,
    },
  });

  return NextResponse.json({ category }, { status: 201 });
}

export async function PATCH(request: Request) {
  const { user, response } = await requireApiUser();
  if (!user) return response!;

  const body = await request.json();

  if (body.kind === "group") {
    const payload = categoryGroupSchema.extend({ id: categoryPatchSchema.shape.id }).safeParse(body);
    if (!payload.success) {
      return badRequest("Invalid category group patch payload");
    }

    const existingGroup = await prisma.categoryGroup.findFirst({
      where: { id: payload.data.id, userId: user.id },
    });
    if (!existingGroup) {
      return NextResponse.json({ error: "Category group not found" }, { status: 404 });
    }

    const group = await prisma.categoryGroup.update({
      where: { id: payload.data.id },
      data: {
        name: payload.data.name,
        sortOrder: payload.data.sortOrder,
        archived: payload.data.archived,
      },
    });

    return NextResponse.json({ group });
  }

  const payload = categoryPatchSchema.safeParse(body);
  if (!payload.success) {
    return badRequest("Invalid category patch payload");
  }

  const existingCategory = await prisma.category.findFirst({
    where: { id: payload.data.id, userId: user.id },
  });
  if (!existingCategory) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }
  if (existingCategory.specialType === "INFLOW") {
    return NextResponse.json(
      { error: "Inflow category is system-managed and cannot be edited here." },
      { status: 409 },
    );
  }

  const category = await prisma.category.update({
    where: { id: payload.data.id },
    data: {
      ...(payload.data.groupId !== undefined ? { groupId: payload.data.groupId } : {}),
      ...(payload.data.name !== undefined ? { name: payload.data.name } : {}),
      ...(payload.data.targetMonthly !== undefined ? { targetMonthly: payload.data.targetMonthly } : {}),
      ...(payload.data.archived !== undefined ? { archived: payload.data.archived } : {}),
    },
  });

  return NextResponse.json({ category });
}

export async function DELETE(request: Request) {
  const { user, response } = await requireApiUser();
  if (!user) return response!;

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const kind = (url.searchParams.get("kind") ?? "category").toLowerCase();

  if (!id) {
    return badRequest("Missing id query parameter");
  }

  if (kind === "group") {
    const existingGroup = await prisma.categoryGroup.findFirst({
      where: { id, userId: user.id },
    });
    if (!existingGroup) {
      return NextResponse.json({ error: "Category group not found" }, { status: 404 });
    }

    const categoryCount = await prisma.category.count({
      where: { userId: user.id, groupId: id },
    });
    if (categoryCount > 0) {
      return NextResponse.json(
        {
          error:
            "Cannot delete a group that still has categories. Move or delete categories first.",
        },
        { status: 409 },
      );
    }

    await prisma.categoryGroup.delete({ where: { id } });
    return NextResponse.json({ deleted: true, kind: "group", id });
  }

  const existingCategory = await prisma.category.findFirst({
    where: { id, userId: user.id },
  });
  if (!existingCategory) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }
  if (existingCategory.specialType === "INFLOW") {
    return NextResponse.json(
      { error: "Inflow category is system-managed and cannot be deleted." },
      { status: 409 },
    );
  }

  const deletedBudgets = await prisma.categoryBudget.deleteMany({
    where: { userId: user.id, categoryId: id },
  });
  await prisma.category.delete({ where: { id } });
  return NextResponse.json({
    deleted: true,
    kind: "category",
    id,
    deletedBudgetAssignments: deletedBudgets.count,
  });
}
