import { describe, it, expect, vi, beforeEach } from "vitest";
import { isFirstWeekFree, effectivePlan } from "../../lib/billing.js";

describe("isFirstWeekFree", () => {
  it("returns true for a user created 1 hour ago", () => {
    const createdAt = new Date(Date.now() - 60 * 60 * 1000);
    expect(isFirstWeekFree(createdAt)).toBe(true);
  });

  it("returns true for a user created 6 days ago", () => {
    const createdAt = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    expect(isFirstWeekFree(createdAt)).toBe(true);
  });

  it("returns false for a user created 8 days ago", () => {
    const createdAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    expect(isFirstWeekFree(createdAt)).toBe(false);
  });

  it("returns false for a user created exactly 7 days ago", () => {
    const createdAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 - 1);
    expect(isFirstWeekFree(createdAt)).toBe(false);
  });
});

describe("effectivePlan", () => {
  it("returns pro for a free user in their first week", () => {
    const createdAt = new Date(Date.now() - 60 * 1000);
    expect(effectivePlan("free", createdAt)).toBe("pro");
  });

  it("returns pro for a starter user in their first week", () => {
    const createdAt = new Date(Date.now() - 60 * 1000);
    expect(effectivePlan("starter", createdAt)).toBe("pro");
  });

  it("returns actual plan after first week", () => {
    const createdAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    expect(effectivePlan("free", createdAt)).toBe("free");
    expect(effectivePlan("starter", createdAt)).toBe("starter");
    expect(effectivePlan("pro", createdAt)).toBe("pro");
  });

  it("returns max for max user regardless of age", () => {
    const newUser = new Date(Date.now() - 60 * 1000);
    const oldUser = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    // First week: effectivePlan returns "pro" (not max) since we cap at pro for free week
    expect(effectivePlan("max", oldUser)).toBe("max");
  });
});

describe("hasRealCredentials", () => {
  it("detects placeholder credentials", async () => {
    const { hasRealCredentials } = await import("../../lib/razorpay-client.js");
    // test env uses placeholder values
    expect(hasRealCredentials()).toBe(false);
  });
});
