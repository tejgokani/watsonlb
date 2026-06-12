import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "stream";
import Fastify from "fastify";
import { authPlugin } from "../../plugins/auth.js";
import { proxyRoutes } from "../../routes/proxy.js";
import { _resetCounters } from "../../lib/router.js";
import { _resetRateLimits } from "../../lib/shield.js";

vi.mock("nanoid", () => ({ nanoid: () => "test-id" }));

vi.mock("../../db/client.js", () => ({
  db: {
    query: {
      projects: { findFirst: vi.fn().mockResolvedValue(undefined) },
    },
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
  },
}));

vi.mock("../../lib/project-cache.js", () => ({
  getCachedProject: vi.fn(),
  setCachedProject: vi.fn(),
  patchCachedBackend: vi.fn(),
  invalidateProject: vi.fn(),
  invalidateBackend: vi.fn(),
}));

vi.mock("../../lib/proxy-forward.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/proxy-forward.js")>();
  return { ...actual, forwardRequest: vi.fn() };
});

import { getCachedProject, patchCachedBackend } from "../../lib/project-cache.js";
import { forwardRequest, BackendUnreachableError } from "../../lib/proxy-forward.js";

const HEALTHY_BACKEND = { id: "b1", url: "http://b1.example.com", active: true, circuitOpen: false, failureStreak: 0 };
const CIRCUIT_OPEN_BACKEND = { ...HEALTHY_BACKEND, id: "bc", circuitOpen: true };

const makeProject = (overrides: Record<string, unknown> = {}) => ({
  id: "proj1",
  proxySlug: "test-slug",
  userId: "user1",
  shieldEnabled: false,
  shieldRateLimit: 60,
  maintenanceHtml: null,
  backends: [HEALTHY_BACKEND],
  ...overrides,
});

/** Helper: mock a successful forward result with a streamable body */
function okResult(body: string, extra: Record<string, unknown> = {}) {
  return {
    statusCode: 200,
    headers: {},
    bodyStream: Readable.from([Buffer.from(body)]),
    responseMs: 10,
    ...extra,
  };
}

const buildApp = async () => {
  const app = Fastify({ logger: false });
  await app.register(authPlugin);
  await app.register(proxyRoutes);
  return app;
};

beforeEach(() => {
  vi.mocked(getCachedProject).mockReturnValue(null);
  vi.clearAllMocks();
  _resetCounters();
  _resetRateLimits();
});

// ── Project resolution ─────────────────────────────────────────────────────

describe("proxy — project resolution", () => {
  it("returns 404 when project slug not found", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/p/unknown-slug/" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: "Proxy not found" });
  });

  it("serves from cache without hitting DB", async () => {
    const { db } = await import("../../db/client.js");
    vi.mocked(getCachedProject).mockReturnValue(makeProject() as never);
    vi.mocked(forwardRequest).mockResolvedValueOnce(okResult("ok") as never);

    const app = await buildApp();
    await app.inject({ method: "GET", url: "/p/test-slug/" });

    expect(db.query.projects.findFirst).not.toHaveBeenCalled();
  });
});

// ── All backends down ──────────────────────────────────────────────────────

describe("proxy — no available backends", () => {
  it("returns 503 HTML when project has no backends", async () => {
    vi.mocked(getCachedProject).mockReturnValue(makeProject({ backends: [] }) as never);

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/p/test-slug/" });

    expect(res.statusCode).toBe(503);
    expect(res.headers["content-type"]).toContain("text/html");
  });

  it("returns 503 when all backends have circuit open", async () => {
    vi.mocked(getCachedProject).mockReturnValue(
      makeProject({ backends: [CIRCUIT_OPEN_BACKEND] }) as never,
    );

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/p/test-slug/" });

    expect(res.statusCode).toBe(503);
    expect(forwardRequest).not.toHaveBeenCalled();
  });

  it("returns 503 when backend throws BackendUnreachableError", async () => {
    vi.mocked(getCachedProject).mockReturnValue(makeProject() as never);
    vi.mocked(forwardRequest).mockRejectedValue(
      new BackendUnreachableError("http://b1.example.com", new Error("ECONNREFUSED")),
    );

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/p/test-slug/" });

    expect(res.statusCode).toBe(503);
  });

  it("serves custom maintenance HTML when all backends fail", async () => {
    vi.mocked(getCachedProject).mockReturnValue(
      makeProject({ maintenanceHtml: "<p>Custom maintenance</p>" }) as never,
    );
    vi.mocked(forwardRequest).mockRejectedValue(
      new BackendUnreachableError("http://b1.example.com", new Error("timeout")),
    );

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/p/test-slug/" });

    expect(res.statusCode).toBe(503);
    expect(res.body).toContain("Custom maintenance");
  });
});

// ── Circuit breaker ────────────────────────────────────────────────────────

describe("proxy — circuit breaker", () => {
  it("patches cache with circuitOpen=true after threshold failures", async () => {
    const weakBackend = { ...HEALTHY_BACKEND, failureStreak: 2 };
    vi.mocked(getCachedProject).mockReturnValue(
      makeProject({ backends: [weakBackend] }) as never,
    );
    vi.mocked(forwardRequest).mockRejectedValue(
      new BackendUnreachableError("http://b1.example.com", new Error("ECONNREFUSED")),
    );

    const app = await buildApp();
    await app.inject({ method: "GET", url: "/p/test-slug/" });

    expect(patchCachedBackend).toHaveBeenCalledWith("b1", {
      failureStreak: 3,
      circuitOpen: true,
    });
  });

  it("does NOT open circuit before threshold", async () => {
    const freshBackend = { ...HEALTHY_BACKEND, failureStreak: 1 };
    vi.mocked(getCachedProject).mockReturnValue(
      makeProject({ backends: [freshBackend] }) as never,
    );
    vi.mocked(forwardRequest).mockRejectedValue(
      new BackendUnreachableError("http://b1.example.com", new Error("ECONNREFUSED")),
    );

    const app = await buildApp();
    await app.inject({ method: "GET", url: "/p/test-slug/" });

    expect(patchCachedBackend).toHaveBeenCalledWith("b1", {
      failureStreak: 2,
      circuitOpen: false,
    });
  });

  it("resets failure streak in cache after a successful forward", async () => {
    const weakBackend = { ...HEALTHY_BACKEND, failureStreak: 2 };
    vi.mocked(getCachedProject).mockReturnValue(
      makeProject({ backends: [weakBackend] }) as never,
    );
    vi.mocked(forwardRequest).mockResolvedValueOnce(okResult("ok") as never);

    const app = await buildApp();
    await app.inject({ method: "GET", url: "/p/test-slug/" });

    expect(patchCachedBackend).toHaveBeenCalledWith("b1", {
      failureStreak: 0,
      circuitOpen: false,
    });
  });
});

// ── Retry on failure ───────────────────────────────────────────────────────

describe("proxy — retry with failover", () => {
  it("falls over to second backend when first fails", async () => {
    const b2 = { id: "b2", url: "http://b2.example.com", active: true, circuitOpen: false, failureStreak: 0 };
    vi.mocked(getCachedProject).mockReturnValue(
      makeProject({ backends: [HEALTHY_BACKEND, b2] }) as never,
    );
    vi.mocked(forwardRequest)
      .mockRejectedValueOnce(new BackendUnreachableError("http://b1.example.com", new Error("down")))
      .mockResolvedValueOnce(okResult("b2-ok", { headers: { "x-origin": "b2" } }) as never);

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/p/test-slug/" });

    expect(res.statusCode).toBe(200);
    expect(forwardRequest).toHaveBeenCalledTimes(2);
  });
});

// ── Successful proxy ───────────────────────────────────────────────────────

describe("proxy — successful forwarding", () => {
  it("returns upstream status code and body", async () => {
    vi.mocked(getCachedProject).mockReturnValue(makeProject() as never);
    vi.mocked(forwardRequest).mockResolvedValueOnce({
      statusCode: 201,
      headers: { "x-custom": "value" },
      bodyStream: Readable.from([Buffer.from('{"created":true}')]),
      responseMs: 15,
    } as never);

    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/p/test-slug/api/items" });

    expect(res.statusCode).toBe(201);
    expect(res.body).toBe('{"created":true}');
    expect(res.headers["x-served-by"]).toBe("watsonlb");
  });

  it("redirects bare slug to slug with trailing slash", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/p/test-slug" });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain("/p/test-slug/");
  });
});

// ── Shield rate limiting ───────────────────────────────────────────────────

describe("proxy — shield", () => {
  it("returns 429 after rate limit exceeded", async () => {
    const shieldProj = {
      ...makeProject(),
      id: "shield-proj",
      shieldEnabled: true,
      shieldRateLimit: 2,
    };
    vi.mocked(getCachedProject).mockReturnValue(shieldProj as never);
    vi.mocked(forwardRequest).mockResolvedValue(okResult("ok") as never);

    const app = await buildApp();
    for (let i = 0; i < 2; i++) {
      await app.inject({ method: "GET", url: "/p/test-slug/" });
    }
    const res = await app.inject({ method: "GET", url: "/p/test-slug/" });

    expect(res.statusCode).toBe(429);
    expect(res.json()).toMatchObject({ code: "SHIELD_RATE_LIMITED" });
  });

  it("blocks requests with unsupported Content-Type when shield is on", async () => {
    const shieldProj = { ...makeProject(), id: "shield-proj-2", shieldEnabled: true, shieldRateLimit: 60 };
    vi.mocked(getCachedProject).mockReturnValue(shieldProj as never);

    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/p/test-slug/",
      headers: { "content-type": "video/mp4" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: "SHIELD_BAD_CONTENT_TYPE" });
  });
});
