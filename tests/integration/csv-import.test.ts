import { describe, expect, it } from "vitest";

import { parseCsvRows } from "@/lib/server/csv-import";

describe("csv parsing", () => {
  it("returns validation errors for malformed date", () => {
    const csv = [
      "date,account,payee,memo,amount,category,status",
      "04/01/2026,Checking,Coffee,,-4.50,Dining Out,cleared",
    ].join("\n");

    const parsed = parseCsvRows(csv);
    expect(parsed.errors.length).toBeGreaterThan(0);
    expect(parsed.errors[0]?.field).toBe("date");
  });

  it("accepts valid template rows", () => {
    const csv = [
      "date,account,payee,memo,amount,category,status",
      "2026-04-01,Checking,Coffee,,-4.50,Dining Out,cleared",
    ].join("\n");

    const parsed = parseCsvRows(csv);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.rows).toHaveLength(1);
  });
});
