import { FastifyInstance } from "fastify";
import { eq, and, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db/client.js";
import { projects, backends, healthLogs, shieldSessions } from "../db/schema.js";
import { pickBackend, pickNextBackend } from "../lib/router.js";
import { forwardRequest, BackendUnreachableError } from "../lib/proxy-forward.js";
import { checkShield } from "../lib/shield.js";
import {
  getCachedProject,
  setCachedProject,
  patchCachedBackend,
} from "../lib/project-cache.js";

const DEFAULT_MAINTENANCE_HTML = `<!DOCTYPE html>
<html><head><title>Service Temporarily Unavailable</title></head>
<body style="font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center">
<h1 style="color:#dc2626">503</h1>
<p>All backends are currently unavailable. We're on it.</p>
</body></html>`;

const CIRCUIT_OPEN_THRESHOLD = 3;

async function resolveProject(slug: string) {
  const cached = getCachedProject(slug);
  if (cached) return cached;

  const project = await db.query.projects.findFirst({
    where: eq(projects.proxySlug, slug),
  });
  if (!project) return null;

  const projectBackends = await db.query.backends.findMany({
    where: and(eq(backends.projectId, project.id), eq(backends.active, true)),
  });

  const entry = {
    id: project.id,
    proxySlug: project.proxySlug,
    userId: project.userId,
    shieldEnabled: project.shieldEnabled,
    shieldRateLimit: project.shieldRateLimit,
    maintenanceHtml: project.maintenanceHtml,
    backends: projectBackends.map((b) => ({
      id: b.id,
      url: b.url,
      active: b.active,
      circuitOpen: b.circuitOpen,
      failureStreak: b.failureStreak,
    })),
  };

  setCachedProject(slug, entry);
  return entry;
}

export async function proxyRoutes(app: FastifyInstance) {
  app.all("/p/:slug/*", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const wildcardPath = (req.params as Record<string, string>)["*"] ?? "";

    // 1. Resolve project — cache hit avoids 2 DB queries
    const project = await resolveProject(slug);
    if (!project) {
      return reply.status(404).send({ error: "Proxy not found" });
    }

    const allBackends = project.backends;

    if (allBackends.length === 0) {
      return reply.status(503).type("text/html")
        .send(project.maintenanceHtml ?? DEFAULT_MAINTENANCE_HTML);
    }

    // 2. Shield check
    if (project.shieldEnabled) {
      const result = checkShield(req, project.id, project.shieldRateLimit);
      if (!result.allowed) {
        // Fire-and-forget shield block count
        db.update(shieldSessions)
          .set({ requestsBlocked: sql`${shieldSessions.requestsBlocked} + 1` })
          .where(
            and(
              eq(shieldSessions.projectId, project.id),
              eq(shieldSessions.endedAt, null as never),
            ),
          )
          .catch(() => {});

        return reply
          .status(result.code === "SHIELD_RATE_LIMITED" ? 429 : 400)
          .send({ error: result.reason, code: result.code });
      }
    }

    // 3. Round-robin with retry across healthy backends
    const tried = new Set<string>();
    let lastError: unknown;
    let backend = pickBackend(project.id, allBackends);

    while (backend !== null) {
      tried.add(backend.id);

      try {
        const result = await forwardRequest(req, backend.url, wildcardPath);

        // Reset failure streak on success — update cache + DB (fire-and-forget)
        if (backend.failureStreak > 0 || backend.circuitOpen) {
          patchCachedBackend(backend.id, { failureStreak: 0, circuitOpen: false });
          db.update(backends)
            .set({ failureStreak: 0, circuitOpen: false })
            .where(eq(backends.id, backend.id))
            .catch(() => {});
        }

        // Health log — fire-and-forget, never blocks response
        db.insert(healthLogs).values({
          id: nanoid(),
          backendId: backend.id,
          status: "up",
          responseMs: result.responseMs,
          statusCode: result.statusCode,
        }).catch(() => {});

        // Forward response — stream body directly, no buffering
        for (const [key, value] of Object.entries(result.headers)) {
          if (Array.isArray(value)) value.forEach((v) => reply.header(key, v));
          else reply.header(key, value);
        }
        reply.header("x-served-by", "watsonlb");
        return reply.status(result.statusCode).send(result.bodyStream);

      } catch (err) {
        lastError = err;

        if (err instanceof BackendUnreachableError) {
          const newStreak = backend.failureStreak + 1;
          const openCircuit = newStreak >= CIRCUIT_OPEN_THRESHOLD;

          // Patch cache immediately so subsequent requests skip this backend
          patchCachedBackend(backend.id, {
            failureStreak: newStreak,
            circuitOpen: openCircuit,
          });

          // DB write + health log — fire-and-forget
          db.update(backends)
            .set({ failureStreak: newStreak, circuitOpen: openCircuit })
            .where(eq(backends.id, backend.id))
            .catch(() => {});

          db.insert(healthLogs).values({
            id: nanoid(),
            backendId: backend.id,
            status: "down",
            responseMs: null,
            statusCode: null,
          }).catch(() => {});

          backend = pickNextBackend(project.id, allBackends, tried);
        } else {
          break;
        }
      }
    }

    app.log.warn({ slug, error: String(lastError) }, "All backends exhausted");
    return reply.status(503).type("text/html")
      .send(project.maintenanceHtml ?? DEFAULT_MAINTENANCE_HTML);
  });

  app.all("/p/:slug", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    return reply.redirect(`/p/${slug}/`);
  });
}
