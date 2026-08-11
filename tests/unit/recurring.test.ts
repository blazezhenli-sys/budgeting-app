import { describe, expect, it } from "vitest";

import { nextQueuedRecurringDate, nextRecurringDate, normalizeRecurringAmount } from "@/lib/server/recurring";

describe("recurring schedule", () => {
  it("advances weekly rules by 7 days", () => {
    const source = new Date("2026-04-01T00:00:00.000Z");
    const next = nextRecurringDate(source, "WEEKLY");
    expect(next.toISOString().slice(0, 10)).toBe("2026-04-08");
  });

  it("advances monthly rules by one calendar month", () => {
    const source = new Date("2026-01-15T00:00:00.000Z");
    const next = nextRecurringDate(source, "MONTHLY");
    expect(next.toISOString().slice(0, 10)).toBe("2026-02-15");
  });

  it("normalizes expense rules to negative amounts", () => {
    expect(normalizeRecurringAmount(5000, "category-1", null)).toBe(-5000);
    expect(normalizeRecurringAmount(-5000, "category-1", null)).toBe(-5000);
  });

  it("normalizes inflow rules to positive amounts", () => {
    expect(normalizeRecurringAmount(5000, "inflow-1", "INFLOW")).toBe(5000);
    expect(normalizeRecurringAmount(-5000, "inflow-1", "INFLOW")).toBe(5000);
    expect(normalizeRecurringAmount(-5000, null, null)).toBe(5000);
  });

  it("queues the next open occurrence after skipping a closed month", () => {
    const next = nextQueuedRecurringDate(
      new Date("2026-07-01T00:00:00.000Z"),
      "MONTHLY",
      new Date("2026-08-11T00:00:00.000Z"),
      new Set(["2026-07"]),
    );

    expect(next?.toISOString().slice(0, 10)).toBe("2026-08-01");
  });

  it("returns no queued occurrence when all due dates are closed", () => {
    const next = nextQueuedRecurringDate(
      new Date("2026-07-01T00:00:00.000Z"),
      "MONTHLY",
      new Date("2026-07-20T00:00:00.000Z"),
      new Set(["2026-07"]),
    );

    expect(next).toBeNull();
  });
});
