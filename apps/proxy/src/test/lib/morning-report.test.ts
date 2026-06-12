import { describe, it, expect } from "vitest";
import {
  isReportWindow,
  localDateString,
  aggregateBackendLogs,
} from "../../lib/morning-report.js";

// ── isReportWindow ─────────────────────────────────────────────────────────────

describe("isReportWindow", () => {
  const makeUTC = (h: number, m: number) =>
    new Date(Date.UTC(2024, 5, 12, h, m, 0));

  it("returns true for IST user at 8:00am IST (2:30am UTC)", () => {
    // IST = UTC+5:30, so 8:00am IST = 02:30 UTC
    const now = makeUTC(2, 30);
    expect(isReportWindow("Asia/Kolkata", now)).toBe(true);
  });

  it("returns true within the 5-minute window (8:04am IST)", () => {
    const now = makeUTC(2, 34);
    expect(isReportWindow("Asia/Kolkata", now)).toBe(true);
  });

  it("returns false outside the window (8:05am IST)", () => {
    const now = makeUTC(2, 35);
    expect(isReportWindow("Asia/Kolkata", now)).toBe(false);
  });

  it("returns false well outside the window (3pm IST)", () => {
    const now = makeUTC(9, 30); // 3pm IST
    expect(isReportWindow("Asia/Kolkata", now)).toBe(false);
  });

  it("handles US/Eastern correctly (8am ET = 12pm UTC in EDT)", () => {
    // EDT = UTC-4, so 8:00am EDT = 12:00 UTC
    const now = makeUTC(12, 0);
    expect(isReportWindow("America/New_York", now)).toBe(true);
  });

  it("returns false for invalid timezone without crashing", () => {
    const now = makeUTC(8, 0);
    expect(() => isReportWindow("Invalid/Timezone", now)).not.toThrow();
    expect(isReportWindow("Invalid/Timezone", now)).toBe(false);
  });
});

// ── aggregateBackendLogs ──────────────────────────────────────────────────────

const makeLogs = (statuses: string[], baseMs = 0) =>
  statuses.map((status, i) => ({
    status,
    checkedAt: new Date(baseMs + i * 5 * 60 * 1000), // 5-min intervals
  }));

describe("aggregateBackendLogs", () => {
  it("returns 100% uptime with no down logs", () => {
    const logs = makeLogs(["up", "up", "up", "up"]);
    const result = aggregateBackendLogs(logs, "https://api.example.com");
    expect(result.uptimePct).toBe(100);
    expect(result.downChecks).toBe(0);
    expect(result.incidents).toHaveLength(0);
  });

  it("returns 0% uptime when all checks fail", () => {
    const logs = makeLogs(["down", "down", "down"]);
    const result = aggregateBackendLogs(logs, "https://api.example.com");
    expect(result.uptimePct).toBe(0);
    expect(result.downChecks).toBe(3);
  });

  it("calculates correct uptime percentage", () => {
    // 3 up, 1 down out of 4 = 75%
    const logs = makeLogs(["up", "down", "up", "up"]);
    const result = aggregateBackendLogs(logs, "https://api.example.com");
    expect(result.uptimePct).toBe(75);
  });

  it("detects a single incident with correct duration", () => {
    // up → down × 3 → up : one 10-min incident (3 checks × 5 min, gap between first down and first up)
    const logs = makeLogs(["up", "down", "down", "up"]);
    const result = aggregateBackendLogs(logs, "https://api.example.com");
    expect(result.incidents).toHaveLength(1);
    expect(result.incidents[0]!.durationMinutes).toBe(10); // 2 × 5 min
  });

  it("detects two separate incidents", () => {
    const logs = makeLogs(["up", "down", "up", "down", "up"]);
    const result = aggregateBackendLogs(logs, "https://api.example.com");
    expect(result.incidents).toHaveLength(2);
  });

  it("handles an open incident (still down at end of window)", () => {
    const logs = makeLogs(["up", "down", "down"]);
    const result = aggregateBackendLogs(logs, "https://api.example.com");
    expect(result.incidents).toHaveLength(1);
  });

  it("returns empty result for no logs (new backend)", () => {
    const result = aggregateBackendLogs([], "https://api.example.com");
    expect(result.uptimePct).toBe(100);
    expect(result.totalChecks).toBe(0);
    expect(result.incidents).toHaveLength(0);
  });

  it("reports correct longestOutageMinutes", () => {
    // incident 1: 5min, incident 2: 15min
    const logs = makeLogs(["up", "down", "up", "down", "down", "down", "up"]);
    const result = aggregateBackendLogs(logs, "https://api.example.com");
    expect(result.longestOutageMinutes).toBe(15); // 3 × 5 min
  });

  it("stores the backend url in the result", () => {
    const result = aggregateBackendLogs([], "https://myapp.railway.app");
    expect(result.url).toBe("https://myapp.railway.app");
  });
});

// ── localDateString ───────────────────────────────────────────────────────────

describe("localDateString", () => {
  it("returns the correct date for IST", () => {
    // 11pm UTC on June 11 = 4:30am June 12 IST
    const now = new Date("2024-06-11T23:00:00Z");
    expect(localDateString("Asia/Kolkata", now)).toBe("2024-06-12");
  });

  it("returns the correct date for UTC-12 on same day", () => {
    // Noon UTC June 12 = Midnight June 12 in UTC-12
    const now = new Date("2024-06-12T12:00:00Z");
    expect(localDateString("Etc/GMT+12", now)).toBe("2024-06-12");
  });
});
