import { describe, expect, it } from "vitest";

import { dedupeHash } from "@/lib/server/hash";

describe("dedupe hash", () => {
  it("is stable for equivalent normalized input", () => {
    const a = dedupeHash({
      date: "2026-04-01",
      amount: -1234,
      payee: "Coffee Shop",
      account: "Checking",
      memo: "Morning",
    });

    const b = dedupeHash({
      date: "2026-04-01",
      amount: -1234,
      payee: "coffee shop",
      account: "checking",
      memo: "morning",
    });

    expect(a).toBe(b);
  });
});
