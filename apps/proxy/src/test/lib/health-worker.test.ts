import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkBackend, CIRCUIT_OPEN_THRESHOLD } from "../../lib/health-worker.js";
import type { Plan } from "@watsonlb/shared";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../../db/client.js", () => ({
  db: {
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
    })),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
  },
}));

vi.mock("../../lib/mailer.js", () => ({
  sendBackendDownAlert: vi.fn().mockResolvedValue({}),
  sendBackendRecoveredAlert: vi.fn().mockResolvedValue({}),
}));

vi.mock("../../lib/health-worker.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../lib/health-worker.js")>();
  return { ...mod };
});

import { db } from "../../db/client.js";
import { sendBackendDownAlert, sendBackendRecoveredAlert } from "../../lib/mailer.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeBackend = (
  overrides: Partial<Parameters<typeof checkBackend>[0]> = {},
) => ({
  id: "b1",
  url: "https://myapp.render.com",
  failureStreak: 0,
  circuitOpen: false,
  projectId: "p1",
  project: { id: "p1", name: "My App", userId: "u1" },
  user: { id: "u1", email: "dev@example.com", plan: "pro" as Plan },
  ...overrides,
});

// ── pingUrl mock ──────────────────────────────────────────────────────────────

vi.mock("undici", () => ({
  request: vi.fn(),
}));

import { request as mockRequest } from "undici";

function mockPingUp(statusCode = 200) {
  vi.mocked(mockRequest).mockResolvedValue({
    statusCode,
    body: { dump: vi.fn().mockResolvedValue(undefined) },
  } as never);
}

function mockPingDown() {
  vi.mocked(mockRequest).mockRejectedValue(new Error("ECONNREFUSED"));
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("checkBackend — healthy ping", () => {
  it("writes an 'up' health log", async () => {
    mockPingUp();
    await checkBackend(makeBackend());
    expect(vi.mocked(db.insert)).toHaveBeenCalledOnce();
  });

  it("resets failure streak on recovery", async () => {
    mockPingUp();
    await checkBackend(makeBackend({ failureStreak: 2 }));
    expect(vi.mocked(db.update)).toHaveBeenCalledOnce();
  });

  it("sends recovery alert for Pro user when was circuit-open", async () => {
    mockPingUp();
    await checkBackend(makeBackend({ circuitOpen: true, failureStreak: 3 }));
    expect(sendBackendRecoveredAlert).toHaveBeenCalledOnce();
  });

  it("does NOT send recovery alert for Free user", async () => {
    mockPingUp();
    await checkBackend(
      makeBackend({
        circuitOpen: true,
        failureStreak: 3,
        user: { id: "u1", email: "dev@example.com", plan: "free" as Plan },
      }),
    );
    expect(sendBackendRecoveredAlert).not.toHaveBeenCalled();
  });

  it("does NOT send recovery alert when backend was healthy (no previous downtime)", async () => {
    mockPingUp();
    await checkBackend(makeBackend({ failureStreak: 0, circuitOpen: false }));
    expect(sendBackendRecoveredAlert).not.toHaveBeenCalled();
  });
});

describe("checkBackend — failed ping", () => {
  it("writes a 'down' health log", async () => {
    mockPingDown();
    await checkBackend(makeBackend());
    expect(vi.mocked(db.insert)).toHaveBeenCalledOnce();
  });

  it("increments failure streak", async () => {
    mockPingDown();
    const updateSpy = vi.mocked(db.update);
    await checkBackend(makeBackend({ failureStreak: 1 }));
    expect(updateSpy).toHaveBeenCalledOnce();
  });

  it("opens circuit when streak reaches threshold", async () => {
    mockPingDown();
    const updateMock = {
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
    };
    vi.mocked(db.update).mockReturnValue(updateMock as never);

    await checkBackend(
      makeBackend({ failureStreak: CIRCUIT_OPEN_THRESHOLD - 1 }),
    );

    expect(updateMock.set).toHaveBeenCalledWith(
      expect.objectContaining({ circuitOpen: true }),
    );
  });

  it("sends down alert for Pro user when circuit just opened", async () => {
    mockPingDown();
    await checkBackend(
      makeBackend({ failureStreak: CIRCUIT_OPEN_THRESHOLD - 1, circuitOpen: false }),
    );
    expect(sendBackendDownAlert).toHaveBeenCalledOnce();
    expect(sendBackendDownAlert).toHaveBeenCalledWith(
      expect.objectContaining({ toEmail: "dev@example.com" }),
    );
  });

  it("does NOT send alert for Free user", async () => {
    mockPingDown();
    await checkBackend(
      makeBackend({
        failureStreak: CIRCUIT_OPEN_THRESHOLD - 1,
        user: { id: "u1", email: "dev@example.com", plan: "free" as Plan },
      }),
    );
    expect(sendBackendDownAlert).not.toHaveBeenCalled();
  });

  it("does NOT send alert when circuit was already open (no duplicate alerts)", async () => {
    mockPingDown();
    await checkBackend(
      makeBackend({ failureStreak: 10, circuitOpen: true }),
    );
    expect(sendBackendDownAlert).not.toHaveBeenCalled();
  });

  it("does NOT send alert before threshold is reached", async () => {
    mockPingDown();
    await checkBackend(makeBackend({ failureStreak: 1 }));
    expect(sendBackendDownAlert).not.toHaveBeenCalled();
  });
});
