import { FastifyInstance } from "fastify";
import { eq, and, gte, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { projects, backends, healthLogs } from "../db/schema.js";
import { aggregateBackendLogs } from "../lib/morning-report.js";

const windowQuery = z.object({
  hours: z.coerce.number().int().min(1).max(168).default(24),
});

export async function healthRoutes(app: FastifyInstance) {
  // GET /projects/:id/health — 24h uptime summary per backend
  app.get(
    "/projects/:id/health",
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const query = windowQuery.safeParse(req.query);
      const hours = query.success ? query.data.hours : 24;

      const project = await db.query.projects.findFirst({
        where: and(eq(projects.id, id), eq(projects.userId, req.user.userId)),
      });
      if (!project) return reply.status(404).send({ error: "Project not found" });

      const since = new Date(Date.now() - hours * 60 * 60 * 1000);

      const projectBackends = await db.query.backends.findMany({
        where: eq(backends.projectId, id),
      });

      const result = await Promise.all(
        projectBackends.map(async (b) => {
          const logs = await db.query.healthLogs.findMany({
            where: and(
              eq(healthLogs.backendId, b.id),
              gte(healthLogs.checkedAt, since),
            ),
            orderBy: [desc(healthLogs.checkedAt)],
            limit: 500,
          });

          const lastLog = logs[0];

          return {
            ...aggregateBackendLogs(
              logs.map((l) => ({ status: l.status, checkedAt: new Date(l.checkedAt) })),
              b.url,
            ),
            backendId: b.id,
            providerHint: b.providerHint,
            active: b.active,
            circuitOpen: b.circuitOpen,
            failureStreak: b.failureStreak,
            lastCheckedAt: lastLog?.checkedAt ?? null,
            lastResponseMs: lastLog?.responseMs ?? null,
            currentStatus: b.circuitOpen
              ? "down"
              : lastLog?.status ?? "unknown",
            // Last 288 data points (5-min intervals × 24h) for sparkline
            timeline: logs.slice(0, 288).map((l) => ({
              t: l.checkedAt,
              s: l.status,
              ms: l.responseMs,
            })),
          };
        }),
      );

      return reply.send({ projectId: id, windowHours: hours, backends: result });
    },
  );

  // GET /projects/:id/backends/:backendId/health — detailed logs for one backend
  app.get(
    "/projects/:id/backends/:backendId/health",
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const { id, backendId } = req.params as { id: string; backendId: string };
      const query = windowQuery.safeParse(req.query);
      const hours = query.success ? query.data.hours : 24;

      const project = await db.query.projects.findFirst({
        where: and(eq(projects.id, id), eq(projects.userId, req.user.userId)),
      });
      if (!project) return reply.status(404).send({ error: "Project not found" });

      const since = new Date(Date.now() - hours * 60 * 60 * 1000);

      const logs = await db.query.healthLogs.findMany({
        where: and(
          eq(healthLogs.backendId, backendId),
          gte(healthLogs.checkedAt, since),
        ),
        orderBy: [desc(healthLogs.checkedAt)],
        limit: 1000,
      });

      return reply.send({ backendId, windowHours: hours, logs });
    },
  );
}
