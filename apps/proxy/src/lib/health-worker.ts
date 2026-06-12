import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { request as undiciRequest } from "undici";
import { db } from "../db/client.js";
import { backends, healthLogs, projects, users } from "../db/schema.js";
import { sendBackendDownAlert, sendBackendRecoveredAlert } from "./mailer.js";
import { patchCachedBackend } from "./project-cache.js";
import type { Plan } from "@watsonlb/shared";
import { PLAN_FEATURES } from "@watsonlb/shared";

export const CIRCUIT_OPEN_THRESHOLD = 3;
const PING_TIMEOUT_MS = 8_000;

export interface CheckedBackend {
  id: string;
  url: string;
  failureStreak: number;
  circuitOpen: boolean;
  projectId: string;
}

interface BackendWithContext extends CheckedBackend {
  project: {
    id: string;
    name: string;
    userId: string;
  };
  user: {
    id: string;
    email: string;
    plan: Plan;
  };
}

/** Pings a single URL and returns { up, responseMs, statusCode }. */
export async function pingUrl(
  url: string,
): Promise<{ up: boolean; responseMs: number; statusCode: number | null }> {
  const start = Date.now();
  try {
    const res = await undiciRequest(`${url}/`, {
      method: "GET",
      headersTimeout: PING_TIMEOUT_MS,
      bodyTimeout: PING_TIMEOUT_MS,
    });
    await res.body.dump(); // drain body to free socket
    const responseMs = Date.now() - start;
    const up = res.statusCode < 500;
    return { up, responseMs, statusCode: res.statusCode };
  } catch {
    return { up: false, responseMs: Date.now() - start, statusCode: null };
  }
}

/** Checks a single backend, writes health log, updates streak, triggers alerts. */
export async function checkBackend(backend: BackendWithContext): Promise<void> {
  const { up, responseMs, statusCode } = await pingUrl(backend.url);

  if (up) {
    const wasDown = backend.circuitOpen || backend.failureStreak > 0;

    await db
      .update(backends)
      .set({ failureStreak: 0, circuitOpen: false })
      .where(eq(backends.id, backend.id));
    patchCachedBackend(backend.id, { failureStreak: 0, circuitOpen: false });

    await db.insert(healthLogs).values({
      id: nanoid(),
      backendId: backend.id,
      status: "up",
      responseMs,
      statusCode,
    });

    // Send recovery alert if backend was previously down (Pro/Max only)
    if (wasDown && PLAN_FEATURES[backend.user.plan].realTimeAlerts) {
      await sendBackendRecoveredAlert({
        toEmail: backend.user.email,
        projectName: backend.project.name,
        backendUrl: backend.url,
        downForMs: responseMs,
      }).catch((err) =>
        console.error("Recovery alert failed:", err),
      );
    }
  } else {
    const newStreak = backend.failureStreak + 1;
    const openCircuit = newStreak >= CIRCUIT_OPEN_THRESHOLD;
    const wasAlreadyOpen = backend.circuitOpen;

    await db
      .update(backends)
      .set({ failureStreak: newStreak, circuitOpen: openCircuit })
      .where(eq(backends.id, backend.id));
    patchCachedBackend(backend.id, { failureStreak: newStreak, circuitOpen: openCircuit });

    await db.insert(healthLogs).values({
      id: nanoid(),
      backendId: backend.id,
      status: "down",
      responseMs,
      statusCode,
    });

    // Send real-time alert only at the moment circuit opens (not on every failure)
    if (openCircuit && !wasAlreadyOpen && PLAN_FEATURES[backend.user.plan].realTimeAlerts) {
      await sendBackendDownAlert({
        toEmail: backend.user.email,
        projectName: backend.project.name,
        backendUrl: backend.url,
        failureStreak: newStreak,
      }).catch((err) =>
        console.error("Down alert failed:", err),
      );
    }
  }
}

/** Fetches all active backends with their project+user context, checks each one. */
export async function checkAllBackends(): Promise<void> {
  const rows = await db.query.backends.findMany({
    where: and(eq(backends.active, true)),
    with: {
      project: {
        with: { user: true },
      },
    },
  });

  await Promise.allSettled(
    rows.map((row) => {
      if (!row.project || !row.project.user) return Promise.resolve();
      return checkBackend({
        id: row.id,
        url: row.url,
        failureStreak: row.failureStreak,
        circuitOpen: row.circuitOpen,
        projectId: row.projectId,
        project: {
          id: row.project.id,
          name: row.project.name,
          userId: row.project.userId,
        },
        user: {
          id: row.project.user.id,
          email: row.project.user.email,
          plan: row.project.user.plan as Plan,
        },
      });
    }),
  );
}
