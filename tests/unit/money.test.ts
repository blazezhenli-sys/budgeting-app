import { describe, expect, it } from "vitest";

import {
  fromCents,
  parseDisplayAmountToUsdCents,
  toCents,
  usdCentsToDisplayInput,
} from "@/lib/money";

describe("money helpers", () => {
  it("converts decimal strings to cents", () => {
    expect(toCents("12.34")).toBe(1234);
    expect(toCents("-5.01")).toBe(-501);
  });

  it("rounds floating precision safely", () => {
    expect(toCents(10.005)).toBe(1001);
  });

  it("formats cents back to fixed decimals", () => {
    expect(fromCents(1234)).toBe("12.34");
  });

  it("converts display input back to usd cents", () => {
    // 10.00 EUR displayed should map to ~10.87 USD using static 0.92 EUR/USD.
    expect(parseDisplayAmountToUsdCents("10.00", "EUR")).toBe(1087);
  });

  it("converts usd cents to display input", () => {
    expect(usdCentsToDisplayInput(1000, "EUR")).toBe("9.20");
  });
});
