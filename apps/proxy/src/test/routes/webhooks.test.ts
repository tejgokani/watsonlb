import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { authPlugin } from "../../plugins/auth.js";
import { webhookRoutes } from "../../routes/webhooks.js";

vi.mock("../../db/client.js", () => ({
  db: {
    query: { users: { findFirst: vi.fn() } },
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
  },
}));

vi.mock("../../lib/billing.js", () => ({
  activatePlan: vi.fn().mockResolvedValue(undefined),
  deactivatePlan: vi.fn().mockResolvedValue(undefined),
  isFirstWeekFree: vi.fn(),
  effectivePlan: vi.fn(),
  chargeShieldHourly: vi.fn(),
  getBillingSummary: vi.fn(),
}));

import { activatePlan, deactivatePlan } from "../../lib/billing.js";

const buildApp = async () => {
  const app = Fastify({ logger: false });
  await app.register(authPlugin);
  await app.register(webhookRoutes);
  return app;
};

const makeSubPayload = (userId: string, plan: string, paymentId = "pay_test") => ({
  event: "subscription.charged",
  payload: {
    subscription: {
      entity: {
        id: "sub_test",
        notes: { userId, plan },
      },
    },
    payment: {
      entity: { id: paymentId },
    },
  },
});

beforeEach(() => vi.clearAllMocks());

// ── subscription.charged ───────────────────────────────────────────────────

describe("POST /webhooks/razorpay — subscription.charged", () => {
  it("calls activatePlan with userId, plan, and paymentId", async () => {
    const app = await buildApp();
    const payload = makeSubPayload("user-123", "pro", "pay_abc");

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/razorpay",
      payload,
    });

    expect(res.statusCode).toBe(200);
    expect(activatePlan).toHaveBeenCalledWith("user-123", "pro", "pay_abc");
  });

  it("does not call activatePlan when notes are missing", async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/razorpay",
      payload: {
        event: "subscription.charged",
        payload: {
          subscription: { entity: { id: "sub_test" } }, // no notes
          payment: { entity: { id: "pay_xyz" } },
        },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(activatePlan).not.toHaveBeenCalled();
  });
});

// ── subscription.cancelled ─────────────────────────────────────────────────

describe("POST /webhooks/razorpay — subscription.cancelled", () => {
  it("calls deactivatePlan with the userId from notes", async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/razorpay",
      payload: {
        event: "subscription.cancelled",
        payload: {
          subscription: {
            entity: { notes: { userId: "user-456" } },
          },
        },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(deactivatePlan).toHaveBeenCalledWith("user-456");
  });

  it("handles subscription.completed the same as cancelled", async () => {
    const app = await buildApp();

    await app.inject({
      method: "POST",
      url: "/webhooks/razorpay",
      payload: {
        event: "subscription.completed",
        payload: {
          subscription: { entity: { notes: { userId: "user-789" } } },
        },
      },
    });

    expect(deactivatePlan).toHaveBeenCalledWith("user-789");
  });
});

// ── Unknown events ─────────────────────────────────────────────────────────

describe("POST /webhooks/razorpay — other events", () => {
  it("returns 200 and ignores unknown events without crashing", async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/razorpay",
      payload: { event: "some.unknown.event", payload: {} },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
    expect(activatePlan).not.toHaveBeenCalled();
    expect(deactivatePlan).not.toHaveBeenCalled();
  });

  it("returns 200 for payment.failed without changing plan", async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/razorpay",
      payload: { event: "payment.failed", payload: { payment: { entity: { id: "pay_failed" } } } },
    });

    expect(res.statusCode).toBe(200);
    expect(deactivatePlan).not.toHaveBeenCalled();
  });
});

// ── Dev upgrade endpoint ───────────────────────────────────────────────────

describe("POST /webhooks/dev/upgrade", () => {
  it("returns 401 without a token", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/dev/upgrade",
      payload: { plan: "pro" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("upgrades to pro when authenticated", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ userId: "u1", email: "u@test.com", plan: "free" });

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/dev/upgrade",
      payload: { plan: "pro" },
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, plan: "pro" });
    expect(activatePlan).toHaveBeenCalledWith("u1", "pro", expect.stringContaining("dev_manual_"));
  });

  it("downgrades to free by calling deactivatePlan", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ userId: "u2", email: "u2@test.com", plan: "pro" });

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/dev/upgrade",
      payload: { plan: "free" },
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(deactivatePlan).toHaveBeenCalledWith("u2");
  });

  it("returns 400 for invalid plan name", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ userId: "u3", email: "u3@test.com", plan: "free" });

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/dev/upgrade",
      payload: { plan: "enterprise" },
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(400);
  });
});
