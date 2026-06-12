import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import { authPlugin } from "../../plugins/auth.js";
import { authRoutes } from "../../routes/auth.js";

// Mock DB calls
vi.mock("../../db/client.js", () => ({
  db: {
    query: {
      users: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
  },
}));

vi.mock("nanoid", () => ({ nanoid: () => "test-id-123" }));

import { db } from "../../db/client.js";

const buildApp = async () => {
  const app = Fastify({ logger: false });
  await app.register(authPlugin);
  await app.register(authRoutes);
  return app;
};

describe("POST /auth/register", () => {
  it("returns 400 on invalid email", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "not-an-email", password: "password123" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 on short password", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "test@example.com", password: "short" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 409 if email already exists", async () => {
    const app = await buildApp();
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce({
      id: "existing",
    } as never);

    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "existing@example.com", password: "password123" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("returns 201 with token on valid registration", async () => {
    const app = await buildApp();
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(undefined);

    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "new@example.com", password: "password123" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toHaveProperty("token");
  });
});

describe("POST /auth/login", () => {
  it("returns 401 on unknown email", async () => {
    const app = await buildApp();
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(undefined);

    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "nobody@example.com", password: "password123" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 on wrong password", async () => {
    const app = await buildApp();
    // bcrypt hash of "correctpassword"
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce({
      id: "uid",
      email: "user@example.com",
      plan: "free",
      passwordHash:
        "$2a$12$invaliddummyhashXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    } as never);

    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "user@example.com", password: "wrongpassword" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 400 on missing fields", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "user@example.com" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /auth/me", () => {
  it("returns 401 without token", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/auth/me" });
    expect(res.statusCode).toBe(401);
  });
});
