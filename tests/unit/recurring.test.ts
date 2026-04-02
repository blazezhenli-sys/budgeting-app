import { describe, expect, it } from "vitest";

import { nextRecurringDate } from "@/lib/server/recurring";

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
});
