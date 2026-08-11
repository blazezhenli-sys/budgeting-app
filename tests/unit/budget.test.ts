import { describe, expect, it } from "vitest";

import { availableToAssign, categoryAvailable, coverOverspendingTransferAmount } from "@/lib/server/budget";

describe("budget math", () => {
  it("calculates category available with rollover", () => {
    expect(categoryAvailable(5000, 10000, -7500)).toBe(7500);
  });

  it("calculates ready-to-assign with prior leftover and month income", () => {
    // prior leftover (15000 - 12000) + current income (5000) - current assigned (4000) = 4000
    expect(availableToAssign(15000, 5000, 12000, 4000)).toBe(4000);
  });

  it("caps overspending coverage to the overspent amount", () => {
    expect(coverOverspendingTransferAmount(-2500, 4000)).toBe(2500);
  });

  it("caps overspending coverage to the source category available amount", () => {
    expect(coverOverspendingTransferAmount(-5000, 2000)).toBe(2000);
  });
});
