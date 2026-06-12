import { describe, it, expect, beforeEach } from "vitest";
import {
  pickBackend,
  pickNextBackend,
  healthyBackends,
  canAddBackend,
  _resetCounters,
} from "../../lib/router.js";
import type { Backend } from "../../lib/router.js";

const makeBackend = (id: string, overrides: Partial<Backend> = {}): Backend => ({
  id,
  url: `https://${id}.example.com`,
  active: true,
  circuitOpen: false,
  failureStreak: 0,
  ...overrides,
});

beforeEach(() => _resetCounters());

describe("healthyBackends", () => {
  it("filters out inactive backends", () => {
    const bs = [makeBackend("a"), makeBackend("b", { active: false })];
    expect(healthyBackends(bs).map((b) => b.id)).toEqual(["a"]);
  });

  it("filters out circuit-open backends", () => {
    const bs = [makeBackend("a"), makeBackend("b", { circuitOpen: true })];
    expect(healthyBackends(bs).map((b) => b.id)).toEqual(["a"]);
  });

  it("returns all when all healthy", () => {
    const bs = [makeBackend("a"), makeBackend("b"), makeBackend("c")];
    expect(healthyBackends(bs)).toHaveLength(3);
  });
});

describe("pickBackend — round-robin", () => {
  it("distributes 9 requests evenly across 3 backends", () => {
    const bs = [makeBackend("a"), makeBackend("b"), makeBackend("c")];
    const results: string[] = [];
    for (let i = 0; i < 9; i++) {
      results.push(pickBackend("proj1", bs)!.id);
    }
    expect(results.filter((r) => r === "a")).toHaveLength(3);
    expect(results.filter((r) => r === "b")).toHaveLength(3);
    expect(results.filter((r) => r === "c")).toHaveLength(3);
  });

  it("returns null when all backends are unhealthy", () => {
    const bs = [
      makeBackend("a", { circuitOpen: true }),
      makeBackend("b", { active: false }),
    ];
    expect(pickBackend("proj2", bs)).toBeNull();
  });

  it("skips circuit-open backends", () => {
    const bs = [
      makeBackend("a"),
      makeBackend("b", { circuitOpen: true }),
      makeBackend("c"),
    ];
    for (let i = 0; i < 10; i++) {
      const picked = pickBackend("proj3", bs)!;
      expect(picked.id).not.toBe("b");
    }
  });

  it("wraps around correctly after counter exceeds backend count", () => {
    const bs = [makeBackend("a"), makeBackend("b")];
    const picks = Array.from({ length: 4 }, () => pickBackend("proj4", bs)!.id);
    expect(picks).toEqual(["a", "b", "a", "b"]);
  });
});

describe("pickNextBackend — retry with exclusion", () => {
  it("skips already-tried backends", () => {
    const bs = [makeBackend("a"), makeBackend("b"), makeBackend("c")];
    const tried = new Set(["a", "b"]);
    const result = pickNextBackend("proj5", bs, tried);
    expect(result?.id).toBe("c");
  });

  it("returns null when all backends are tried", () => {
    const bs = [makeBackend("a"), makeBackend("b")];
    const tried = new Set(["a", "b"]);
    expect(pickNextBackend("proj6", bs, tried)).toBeNull();
  });

  it("skips both tried and circuit-open backends", () => {
    const bs = [
      makeBackend("a"),
      makeBackend("b", { circuitOpen: true }),
      makeBackend("c"),
    ];
    const tried = new Set(["a"]);
    const result = pickNextBackend("proj7", bs, tried);
    expect(result?.id).toBe("c");
  });
});

describe("canAddBackend", () => {
  it("allows adding on free plan up to 2", () => {
    expect(canAddBackend(0, "free")).toBe(true);
    expect(canAddBackend(1, "free")).toBe(true);
    expect(canAddBackend(2, "free")).toBe(false);
  });

  it("allows adding on pro plan up to 4", () => {
    expect(canAddBackend(3, "pro")).toBe(true);
    expect(canAddBackend(4, "pro")).toBe(false);
  });

  it("allows unlimited backends on max plan", () => {
    expect(canAddBackend(100, "max")).toBe(true);
    expect(canAddBackend(9999, "max")).toBe(true);
  });
});
