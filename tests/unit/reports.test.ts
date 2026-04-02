import { describe, expect, it } from "vitest";

import { buildSpendingInsights } from "@/lib/server/reports";
import type { BudgetCategoryRow } from "@/lib/types";

function categoryRow(input: Partial<BudgetCategoryRow> & Pick<BudgetCategoryRow, "categoryId" | "categoryName" | "groupId" | "groupName" | "activity">): BudgetCategoryRow {
  return {
    categoryId: input.categoryId,
    categoryName: input.categoryName,
    groupId: input.groupId,
    groupName: input.groupName,
    assigned: input.assigned ?? 0,
    activity: input.activity,
    available: input.available ?? 0,
    targetMonthly: input.targetMonthly ?? null,
    overspent: input.overspent ?? false,
    archived: input.archived ?? false,
  };
}

describe("report spending insights", () => {
  it("builds group and category breakdowns from monthly activity", () => {
    const rows: BudgetCategoryRow[] = [
      categoryRow({
        categoryId: "rent",
        categoryName: "Rent",
        groupId: "fixed",
        groupName: "Fixed Costs",
        activity: -120000,
      }),
      categoryRow({
        categoryId: "internet",
        categoryName: "Internet",
        groupId: "fixed",
        groupName: "Fixed Costs",
        activity: -6500,
      }),
      categoryRow({
        categoryId: "groceries",
        categoryName: "Groceries",
        groupId: "living",
        groupName: "Living",
        activity: -29000,
      }),
      categoryRow({
        categoryId: "refund",
        categoryName: "Refund",
        groupId: "living",
        groupName: "Living",
        activity: 2500,
      }),
    ];

    const insights = buildSpendingInsights(rows);

    expect(insights.totalSpent).toBe(155500);
    expect(insights.spendingByGroup).toHaveLength(2);
    expect(insights.spendingByGroup[0]).toMatchObject({
      groupName: "Fixed Costs",
      spent: 126500,
      categoryCount: 2,
    });
    expect(insights.spendingByGroup[0].share).toBeCloseTo(126500 / 155500, 8);
    expect(insights.topSpendingCategories).toHaveLength(3);
    expect(insights.topSpendingCategories[0]).toMatchObject({
      categoryId: "rent",
      categoryName: "Rent",
      groupName: "Fixed Costs",
      spent: 120000,
    });
  });

  it("returns empty insight rows when there is no expense activity", () => {
    const rows: BudgetCategoryRow[] = [
      categoryRow({
        categoryId: "inflow",
        categoryName: "Inflow",
        groupId: "meta",
        groupName: "Meta",
        activity: 50000,
      }),
    ];

    const insights = buildSpendingInsights(rows);
    expect(insights.totalSpent).toBe(0);
    expect(insights.spendingByGroup).toEqual([]);
    expect(insights.topSpendingCategories).toEqual([]);
  });
});
