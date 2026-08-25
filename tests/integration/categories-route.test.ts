import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const requireApiUser = vi.fn();
const badRequest = vi.fn((message: string) => NextResponse.json({ error: message }, { status: 400 }));

const prisma = {
  $transaction: vi.fn(),
  category: {
    findFirst: vi.fn(),
    delete: vi.fn(),
  },
  categoryGroup: {
    findFirst: vi.fn(),
    delete: vi.fn(),
  },
  transaction: {
    count: vi.fn(),
  },
  transactionSplit: {
    count: vi.fn(),
  },
  recurringRule: {
    count: vi.fn(),
  },
  categoryBudget: {
    count: vi.fn(),
  },
};

const transactionClient = {
  category: {
    delete: vi.fn(),
  },
  transaction: {
    updateMany: vi.fn(),
  },
  transactionSplit: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  recurringRule: {
    updateMany: vi.fn(),
  },
  categoryBudget: {
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
};

vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("@/lib/server/api", () => ({ requireApiUser, badRequest }));
vi.mock("@/lib/server/inflow", () => ({ ensureInflowCategory: vi.fn() }));

describe("categories DELETE route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    requireApiUser.mockResolvedValue({
      user: { id: "user-1" },
      response: null,
    });
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof transactionClient) => unknown) =>
      callback(transactionClient),
    );
  });

  it("blocks deleting a category with linked content until a replacement is chosen", async () => {
    prisma.category.findFirst.mockImplementation(async ({ where }: { where: { id?: string; specialType?: { not: null } } }) => {
      if (where.id === "category-1") {
        return {
          id: "category-1",
          userId: "user-1",
          groupId: "group-1",
          specialType: null,
        };
      }
      return null;
    });
    prisma.transaction.count.mockResolvedValue(2);
    prisma.transactionSplit.count.mockResolvedValue(1);
    prisma.recurringRule.count.mockResolvedValue(3);
    prisma.categoryBudget.count.mockResolvedValue(4);

    const { DELETE } = await import("@/app/api/categories/route");
    const response = await DELETE(new Request("http://localhost/api/categories?kind=category&id=category-1"));
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain("2 transactions");
    expect(payload.error).toContain("1 split allocation");
    expect(payload.error).toContain("3 recurring rules");
    expect(payload.error).toContain("4 budget assignments");
    expect(payload.error).toContain("Choose another category as the replacement");
    expect(prisma.category.delete).not.toHaveBeenCalled();
  });

  it("moves linked content into a replacement category before deleting", async () => {
    prisma.category.findFirst.mockImplementation(
      async ({ where }: { where: { id?: string; archived?: boolean; specialType?: { not: null } | null } }) => {
        if (where.id === "category-1") {
          return {
            id: "category-1",
            userId: "user-1",
            groupId: "group-1",
            specialType: null,
          };
        }
        if (where.id === "category-2") {
          return {
            id: "category-2",
          };
        }
        return null;
      },
    );
    prisma.transaction.count.mockResolvedValue(2);
    prisma.transactionSplit.count.mockResolvedValue(1);
    prisma.recurringRule.count.mockResolvedValue(1);
    prisma.categoryBudget.count.mockResolvedValue(1);
    transactionClient.transactionSplit.findMany.mockResolvedValue([{ id: "split-1" }]);
    transactionClient.categoryBudget.findMany
      .mockResolvedValueOnce([
        {
          id: "budget-source",
          budgetMonthId: "month-1",
          assigned: 500,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "budget-target",
          budgetMonthId: "month-1",
          assigned: 200,
        },
      ]);
    transactionClient.transaction.updateMany.mockResolvedValue({ count: 2 });
    transactionClient.recurringRule.updateMany.mockResolvedValue({ count: 1 });
    transactionClient.transactionSplit.updateMany.mockResolvedValue({ count: 1 });

    const { DELETE } = await import("@/app/api/categories/route");
    const request = new Request("http://localhost/api/categories?kind=category&id=category-1", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ replacementCategoryId: "category-2" }),
    });
    const response = await DELETE(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      deleted: true,
      kind: "category",
      id: "category-1",
      replacementCategoryId: "category-2",
      movedTransactions: 2,
      movedSplits: 1,
      movedRecurringRules: 1,
      movedBudgetAssignments: 1,
    });
    expect(transactionClient.transaction.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        categoryId: "category-1",
      },
      data: {
        categoryId: "category-2",
      },
    });
    expect(transactionClient.categoryBudget.update).toHaveBeenCalledWith({
      where: { id: "budget-target" },
      data: { assigned: 700 },
    });
    expect(transactionClient.categoryBudget.delete).toHaveBeenCalledWith({
      where: { id: "budget-source" },
    });
    expect(transactionClient.category.delete).toHaveBeenCalledWith({ where: { id: "category-1" } });
  });

  it("deletes an empty category", async () => {
    prisma.category.findFirst.mockImplementation(async ({ where }: { where: { id?: string; specialType?: { not: null } } }) => {
      if (where.id === "category-1") {
        return {
          id: "category-1",
          userId: "user-1",
          groupId: "group-1",
          specialType: null,
        };
      }
      return null;
    });
    prisma.transaction.count.mockResolvedValue(0);
    prisma.transactionSplit.count.mockResolvedValue(0);
    prisma.recurringRule.count.mockResolvedValue(0);
    prisma.categoryBudget.count.mockResolvedValue(0);
    prisma.category.delete.mockResolvedValue({ id: "category-1" });

    const { DELETE } = await import("@/app/api/categories/route");
    const response = await DELETE(new Request("http://localhost/api/categories?kind=category&id=category-1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      deleted: true,
      kind: "category",
      id: "category-1",
    });
    expect(prisma.category.delete).toHaveBeenCalledWith({ where: { id: "category-1" } });
  });
});
