import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { authPlugin } from "../../plugins/auth.js";
import { ctrlRoutes } from "../../routes/ctrl.js";

// Fluent Drizzle select chain — no outer variable refs so vi.mock hoisting works
vi.mock("../../db/client.js", () => {
  const chain = () => {
    const c: Record<string, unknown> = {};
    c.from = vi.fn().mockReturnValue(c);
    c.where = vi.fn().mockReturnValue(c);
    c.orderBy = vi.fn().mockReturnValue(c);
    c.limit = vi.fn().mockReturnValue(c);
    c.offset = vi.fn().mockResolvedValue([{ total: 0 }]);
    return c;
  };
  return {
    db: {
      select: vi.fn().mockImplementation(() => chain()),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })),
      delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
    },
  };
});

const buildApp = async () => {
  const app = Fastify({ logger: false });
  await app.register(authPlugin);
  await app.register(ctrlRoutes);
  return app;
};

const ADMIN_PAYLOAD = { userId: "admin1", email: "admin@example.com", plan: "free" as const, isAdmin: true };
const USER_PAYLOAD = { userId: "user1", email: "user@example.com", plan: "free" as const, isAdmin: false };

// ── Authentication enforcement ─────────────────────────────────────────────

describe("ctrl routes — authentication", () => {
  it("GET /ctrl/stats → 401 with no token", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/ctrl/stats" });
    expect(res.statusCode).toBe(401);
  });

  it("GET /ctrl/stats → 403 with a non-admin token", async () => {
    const app = await buildApp();
    const token = app.jwt.sign(USER_PAYLOAD);
    const res = await app.inject({
      method: "GET",
      url: "/ctrl/stats",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("GET /ctrl/users → 401 with no token", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/ctrl/users" });
    expect(res.statusCode).toBe(401);
  });

  it("GET /ctrl/users → 403 with a non-admin token", async () => {
    const app = await buildApp();
    const token = app.jwt.sign(USER_PAYLOAD);
    const res = await app.inject({
      method: "GET",
      url: "/ctrl/users",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("PATCH /ctrl/users/:id → 403 with non-admin token", async () => {
    const app = await buildApp();
    const token = app.jwt.sign(USER_PAYLOAD);
    const res = await app.inject({
      method: "PATCH",
      url: "/ctrl/users/some-id",
      payload: { plan: "pro" },
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("DELETE /ctrl/users/:id → 403 with non-admin token", async () => {
    const app = await buildApp();
    const token = app.jwt.sign(USER_PAYLOAD);
    const res = await app.inject({
      method: "DELETE",
      url: "/ctrl/users/some-id",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("DELETE /ctrl/projects/:id → 401 with no token", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "DELETE", url: "/ctrl/projects/p1" });
    expect(res.statusCode).toBe(401);
  });
});

// ── Admin authorization enforcement ───────────────────────────────────────

describe("ctrl routes — admin actions", () => {
  it("DELETE /ctrl/users/:id → 400 when admin tries to delete themselves", async () => {
    const app = await buildApp();
    const token = app.jwt.sign(ADMIN_PAYLOAD);
    const res = await app.inject({
      method: "DELETE",
      url: `/ctrl/users/${ADMIN_PAYLOAD.userId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "Cannot delete your own account" });
  });

  it("PATCH /ctrl/users/:id → 400 when no fields provided", async () => {
    const app = await buildApp();
    const token = app.jwt.sign(ADMIN_PAYLOAD);
    const res = await app.inject({
      method: "PATCH",
      url: "/ctrl/users/other-user",
      payload: {},
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it("PATCH /ctrl/users/:id → 400 with invalid plan", async () => {
    const app = await buildApp();
    const token = app.jwt.sign(ADMIN_PAYLOAD);
    const res = await app.inject({
      method: "PATCH",
      url: "/ctrl/users/other-user",
      payload: { plan: "enterprise" },
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
  });
});
