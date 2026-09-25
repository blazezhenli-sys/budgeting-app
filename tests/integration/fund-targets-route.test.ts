import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/budget/[month]/fund-targets/route";

const { requireApiUser, badRequest, quickAutoAssign } = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  badRequest: vi.fn((message: string) => Response.json({ error: message }, { status: 400 })),
  quickAutoAssign: vi.fn(),
}));

vi.mock("@/lib/server/api", () => ({ requireApiUser, badRequest }));
vi.mock("@/lib/server/budget", () => ({ quickAutoAssign }));

describe("budget auto-assign route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiUser.mockResolvedValue({ user: { id: "user-1" }, response: null });
    quickAutoAssign.mockResolvedValue({ budget: { categories: [] }, fundedCount: 0 });
  });

  it("returns a bad request for malformed JSON", async () => {
    const request = new Request("http://localhost/api/budget/2026-09/fund-targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const response = await POST(request, { params: Promise.resolve({ month: "2026-09" }) });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid auto-assign payload" });
    expect(quickAutoAssign).not.toHaveBeenCalled();
  });

  it("passes the selected mode to auto-assign", async () => {
    const request = new Request("http://localhost/api/budget/2026-09/fund-targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "overspent_then_underfunded" }),
    });

    const response = await POST(request, { params: Promise.resolve({ month: "2026-09" }) });

    expect(response.status).toBe(200);
    expect(quickAutoAssign).toHaveBeenCalledWith("user-1", "2026-09", "overspent_then_underfunded");
  });
});
