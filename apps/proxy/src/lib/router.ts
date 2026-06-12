import type { Plan } from "@watsonlb/shared";
import { PLAN_BACKEND_LIMITS } from "@watsonlb/shared";

export interface Backend {
  id: string;
  url: string;
  active: boolean;
  circuitOpen: boolean;
  failureStreak: number;
}

// In-memory round-robin counters per project — reset on restart (acceptable for proxy use)
const counters = new Map<string, number>();

/** Returns backends eligible to receive traffic: active and circuit closed. */
export function healthyBackends(backends: Backend[]): Backend[] {
  return backends.filter((b) => b.active && !b.circuitOpen);
}

/** Picks the next backend in round-robin order. Returns null if none are healthy. */
export function pickBackend(
  projectId: string,
  backends: Backend[],
): Backend | null {
  const eligible = healthyBackends(backends);
  if (eligible.length === 0) return null;

  const current = counters.get(projectId) ?? 0;
  const next = current % eligible.length;
  counters.set(projectId, next + 1);

  return eligible[next] ?? null;
}

/** Same as pickBackend but skips a set of already-tried backend IDs (for retry). */
export function pickNextBackend(
  projectId: string,
  backends: Backend[],
  exclude: Set<string>,
): Backend | null {
  const eligible = healthyBackends(backends).filter((b) => !exclude.has(b.id));
  if (eligible.length === 0) return null;

  const current = counters.get(projectId) ?? 0;
  const next = current % eligible.length;
  counters.set(projectId, next + 1);

  return eligible[next] ?? null;
}

export function canAddBackend(currentCount: number, plan: Plan): boolean {
  return currentCount < PLAN_BACKEND_LIMITS[plan];
}

/** Exposed for tests — resets all counters */
export function _resetCounters() {
  counters.clear();
}
