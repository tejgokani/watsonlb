import { Pool } from "undici";
import type { FastifyRequest } from "fastify";
import type { Readable } from "stream";

export interface ForwardResult {
  statusCode: number;
  headers: Record<string, string | string[]>;
  /** Stream — pipe directly into reply.send() for zero-copy forwarding. */
  bodyStream: Readable;
  responseMs: number;
}

export class BackendUnreachableError extends Error {
  constructor(
    public backendUrl: string,
    cause: unknown,
  ) {
    super(`Backend unreachable: ${backendUrl}`);
    this.cause = cause;
  }
}

const HOP_BY_HOP = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade", "host",
]);

// Never forward these to backends — they carry WatsonLB credentials
const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "x-api-key",
]);

/**
 * Connection pool per backend origin — reuses TCP connections across requests.
 * Each pool keeps up to 10 open connections, cutting per-request TCP handshake overhead.
 */
const pools = new Map<string, Pool>();

function getPool(origin: string): Pool {
  let pool = pools.get(origin);
  if (!pool) {
    pool = new Pool(origin, {
      connections: 10,
      pipelining: 1,
      keepAliveTimeout: 60_000,
      keepAliveMaxTimeout: 300_000,
    });
    pools.set(origin, pool);
  }
  return pool;
}

/**
 * Forwards an incoming Fastify request to targetUrl + path.
 * Returns headers + a stream — caller pipes stream to reply for zero-copy forwarding.
 * BackendUnreachableError is thrown only if the connection itself fails (before headers).
 * Once headers are received the backend is confirmed reachable, so no retry is needed.
 */
export async function forwardRequest(
  req: FastifyRequest,
  targetBaseUrl: string,
  path: string,
): Promise<ForwardResult> {
  const origin = new URL(targetBaseUrl).origin;
  const targetPath = `/${path.replace(/^\//, "")}${req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}`;

  const forwardHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    const lower = key.toLowerCase();
    if (!HOP_BY_HOP.has(lower) && !SENSITIVE_HEADERS.has(lower) && typeof value === "string") {
      forwardHeaders[key] = value;
    }
  }
  forwardHeaders["x-forwarded-for"] =
    (req.headers["x-forwarded-for"] as string) ?? req.ip;
  forwardHeaders["x-forwarded-host"] = req.hostname;
  forwardHeaders["x-watsonlb"] = "1";

  const body = req.body
    ? Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(JSON.stringify(req.body))
    : null;

  const start = Date.now();

  try {
    const pool = getPool(origin);
    const res = await pool.request({
      path: targetPath,
      method: req.method as never,
      headers: forwardHeaders,
      body,
      headersTimeout: 10_000,
      bodyTimeout: 30_000,
    });

    // Time-to-first-byte — most useful latency metric for health monitoring
    const responseMs = Date.now() - start;

    const responseHeaders: Record<string, string | string[]> = {};
    for (const [key, value] of Object.entries(res.headers)) {
      if (!HOP_BY_HOP.has(key.toLowerCase()) && value !== undefined) {
        responseHeaders[key] = value;
      }
    }

    return {
      statusCode: res.statusCode,
      headers: responseHeaders,
      bodyStream: res.body as unknown as Readable,
      responseMs,
    };
  } catch (err) {
    throw new BackendUnreachableError(targetBaseUrl, err);
  }
}
