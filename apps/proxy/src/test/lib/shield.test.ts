import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkShield, _resetRateLimits } from "../../lib/shield.js";
import type { FastifyRequest } from "fastify";

const makeReq = (overrides: Partial<FastifyRequest["headers"]> = {}): FastifyRequest =>
  ({
    headers: { host: "example.com", ...overrides },
    ip: "1.2.3.4",
  }) as unknown as FastifyRequest;

beforeEach(() => _resetRateLimits());

describe("checkShield — header validation", () => {
  it("blocks requests with no Host header", () => {
    const req = makeReq({ host: undefined });
    const result = checkShield(req, "proj1", 60);
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("SHIELD_NO_HOST");
  });

  it("blocks requests with unrecognized Content-Type", () => {
    const req = makeReq({ "content-type": "x-custom/garbage" });
    const result = checkShield(req, "proj2", 60);
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("SHIELD_BAD_CONTENT_TYPE");
  });

  it("allows standard Content-Types", () => {
    const types = [
      "application/json",
      "application/x-www-form-urlencoded",
      "text/html",
      "multipart/form-data",
      "image/png",
    ];
    for (const ct of types) {
      _resetRateLimits();
      const req = makeReq({ "content-type": ct });
      expect(checkShield(req, "proj3", 60).allowed).toBe(true);
    }
  });
});

describe("checkShield — rate limiting", () => {
  it("allows requests within limit", () => {
    const req = makeReq();
    for (let i = 0; i < 60; i++) {
      expect(checkShield(req, "proj4", 60).allowed).toBe(true);
    }
  });

  it("blocks the 61st request within the window", () => {
    const req = makeReq();
    for (let i = 0; i < 60; i++) checkShield(req, "proj5", 60);
    const result = checkShield(req, "proj5", 60);
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("SHIELD_RATE_LIMITED");
  });

  it("uses separate counters for different IPs", () => {
    const req1 = makeReq();
    const req2 = { ...makeReq(), ip: "9.9.9.9" } as unknown as FastifyRequest;
    for (let i = 0; i < 60; i++) checkShield(req1, "proj6", 60);
    // req2 from different IP should still be allowed
    expect(checkShield(req2, "proj6", 60).allowed).toBe(true);
  });

  it("uses separate counters for different projects", () => {
    const req = makeReq();
    for (let i = 0; i < 60; i++) checkShield(req, "projA", 60);
    // Different project — fresh counter
    expect(checkShield(req, "projB", 60).allowed).toBe(true);
  });

  it("resets after the window expires", () => {
    const req = makeReq();
    for (let i = 0; i < 60; i++) checkShield(req, "proj7", 60);
    // Fast-forward time by mocking Date.now
    const realNow = Date.now;
    vi.spyOn(Date, "now").mockReturnValue(realNow() + 65_000);
    expect(checkShield(req, "proj7", 60).allowed).toBe(true);
    vi.restoreAllMocks();
  });
});
