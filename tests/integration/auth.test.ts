import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "@/lib/server/auth";

describe("auth hashing", () => {
  it("hashes and verifies a password", async () => {
    const hashed = await hashPassword("super-secret-pass");
    expect(await verifyPassword("super-secret-pass", hashed)).toBe(true);
    expect(await verifyPassword("bad-pass", hashed)).toBe(false);
  });
});
