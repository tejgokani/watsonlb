import type { FastifyRequest } from "fastify";

export interface ShieldResult {
  allowed: boolean;
  reason?: string;
  code?: string;
}

interface RateWindow {
  count: number;
  windowStart: number;
}

// In-memory rate limit windows: key = `${projectId}:${ip}`
const rateLimitWindows = new Map<string, RateWindow>();
const WINDOW_MS = 60_000; // 1-minute sliding window

export function checkShield(
  req: FastifyRequest,
  projectId: string,
  rateLimit: number, // requests per minute
): ShieldResult {
  // 1. Header validation
  if (!req.headers["host"]) {
    return { allowed: false, reason: "Missing Host header", code: "SHIELD_NO_HOST" };
  }

  const contentType = req.headers["content-type"];
  if (
    contentType &&
    !contentType.startsWith("application/") &&
    !contentType.startsWith("text/") &&
    !contentType.startsWith("multipart/") &&
    !contentType.startsWith("image/")
  ) {
    return {
      allowed: false,
      reason: `Unrecognized Content-Type: ${contentType}`,
      code: "SHIELD_BAD_CONTENT_TYPE",
    };
  }

  // 2. Rate limiting (per project + IP)
  const ip = req.ip ?? "unknown";
  const key = `${projectId}:${ip}`;
  const now = Date.now();
  const window = rateLimitWindows.get(key);

  if (!window || now - window.windowStart > WINDOW_MS) {
    rateLimitWindows.set(key, { count: 1, windowStart: now });
  } else {
    window.count += 1;
    if (window.count > rateLimit) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${rateLimit} req/min`,
        code: "SHIELD_RATE_LIMITED",
      };
    }
  }

  return { allowed: true };
}

/** Evict stale rate limit windows older than 2 minutes — called by cron */
export function evictStaleWindows() {
  const cutoff = Date.now() - 2 * WINDOW_MS;
  for (const [key, window] of rateLimitWindows.entries()) {
    if (window.windowStart < cutoff) rateLimitWindows.delete(key);
  }
}

/** Exposed for tests */
export function _resetRateLimits() {
  rateLimitWindows.clear();
}
