import { describe, expect, it } from "vitest";

import { incomeTransactionWhere } from "@/lib/server/budget";

describe("income transaction filtering", () => {
  it("counts only explicit inflow-category income", () => {
    const start = new Date("2026-08-01T00:00:00.000Z");
    const end = new Date("2026-08-31T23:59:59.999Z");

    const where = incomeTransactionWhere("user-1", start, end);

    expect(where).toMatchObject({
      userId: "user-1",
      transferGroup: null,
      amount: { gt: 0 },
      category: { specialType: "INFLOW" },
      date: {
        gte: start,
        lte: end,
      },
    });
    expect(where).not.toHaveProperty("OR");
  });
});
