import { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { projects, backends } from "../db/schema.js";
import { canAddBackend } from "../lib/router.js";
import { invalidateProject, invalidateBackend } from "../lib/project-cache.js";
import { isSsrfSafe } from "../lib/ssrf-guard.js";
import type { Plan } from "@watsonlb/shared";

/** Strip script tags and on* event handlers from user-supplied HTML. */
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<script[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/data\s*:/gi, "");
}

const sanitizedHtml = z
  .string()
  .max(10_000)
  .transform((v) => sanitizeHtml(v));

const createProjectBody = z.object({
  name: z.string().min(1).max(80),
  maintenanceHtml: sanitizedHtml.optional(),
});

const updateProjectBody = z.object({
  name: z.string().min(1).max(80).optional(),
  maintenanceHtml: sanitizedHtml.optional(),
  shieldEnabled: z.boolean().optional(),
  shieldRateLimit: z.number().int().min(1).max(10_000).optional(),
  shieldDailyCap: z.number().positive().optional(),
  healthCheckInterval: z.number().int().min(1).max(60).optional(),
});

const addBackendBody = z.object({
  url: z.string().url(),
  providerHint: z
    .enum([
      "render",
      "railway",
      "fly",
      "koyeb",
      "vercel",
      "glitch",
      "other",
    ])
    .optional(),
});

export async function projectRoutes(app: FastifyInstance) {
  // ── Projects ──────────────────────────────────────────────────────────────

  app.post(
    "/projects",
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const body = createProjectBody.safeParse(req.body);
      if (!body.success)
        return reply.status(400).send({ error: body.error.flatten().fieldErrors });

      const slug = nanoid(10);
      const id = nanoid();

      await db.insert(projects).values({
        id,
        userId: req.user.userId,
        name: body.data.name,
        proxySlug: slug,
        maintenanceHtml: body.data.maintenanceHtml,
      });

      return reply.status(201).send({ id, proxySlug: slug });
    },
  );

  app.get(
    "/projects",
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const rows = await db.query.projects.findMany({
        where: eq(projects.userId, req.user.userId),
        with: { backends: { columns: { id: true, url: true, active: true, circuitOpen: true } } },
      });
      return reply.send(rows);
    },
  );

  app.get(
    "/projects/:id",
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const row = await db.query.projects.findFirst({
        where: and(
          eq(projects.id, id),
          eq(projects.userId, req.user.userId),
        ),
        with: { backends: true },
      });
      if (!row) return reply.status(404).send({ error: "Project not found" });
      return reply.send(row);
    },
  );

  app.patch(
    "/projects/:id",
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = updateProjectBody.safeParse(req.body);
      if (!body.success)
        return reply.status(400).send({ error: body.error.flatten().fieldErrors });

      const project = await db.query.projects.findFirst({
        where: and(eq(projects.id, id), eq(projects.userId, req.user.userId)),
      });
      if (!project) return reply.status(404).send({ error: "Project not found" });

      // Shield requires Pro or Max (or add-on handled separately)
      if (body.data.shieldEnabled === true) {
        const plan = req.user.plan as Plan;
        if (plan === "free") {
          return reply.status(403).send({
            error: "Shield requires Starter (add-on) or Pro/Max plan",
          });
        }
      }

      await db.update(projects).set(body.data).where(eq(projects.id, id));
      invalidateProject(project.proxySlug);
      return reply.send({ ok: true });
    },
  );

  app.delete(
    "/projects/:id",
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const project = await db.query.projects.findFirst({
        where: and(eq(projects.id, id), eq(projects.userId, req.user.userId)),
      });
      if (!project) return reply.status(404).send({ error: "Project not found" });

      await db.delete(projects).where(eq(projects.id, id));
      invalidateProject(project.proxySlug);
      return reply.send({ ok: true });
    },
  );

  // ── Backends ───────────────────────────────────────────────────────────────

  app.post(
    "/projects/:id/backends",
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = addBackendBody.safeParse(req.body);
      if (!body.success)
        return reply.status(400).send({ error: body.error.flatten().fieldErrors });

      const project = await db.query.projects.findFirst({
        where: and(eq(projects.id, id), eq(projects.userId, req.user.userId)),
      });
      if (!project) return reply.status(404).send({ error: "Project not found" });

      // SSRF guard — reject private/internal IPs
      if (!isSsrfSafe(body.data.url)) {
        return reply.status(400).send({ error: "Backend URL must be a public internet address" });
      }

      // Tier backend-count enforcement
      const existingBackends = await db.query.backends.findMany({
        where: and(eq(backends.projectId, id), eq(backends.active, true)),
      });
      if (!canAddBackend(existingBackends.length, req.user.plan as Plan)) {
        return reply.status(403).send({
          error: `Your ${req.user.plan} plan allows max ${existingBackends.length} backends. Upgrade to add more.`,
        });
      }

      const backendId = nanoid();
      await db.insert(backends).values({
        id: backendId,
        projectId: id,
        url: body.data.url.replace(/\/$/, ""),
        providerHint: body.data.providerHint,
      });
      invalidateProject(project.proxySlug);
      return reply.status(201).send({ id: backendId });
    },
  );

  app.get(
    "/projects/:id/backends",
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const project = await db.query.projects.findFirst({
        where: and(eq(projects.id, id), eq(projects.userId, req.user.userId)),
      });
      if (!project) return reply.status(404).send({ error: "Project not found" });

      const rows = await db.query.backends.findMany({
        where: eq(backends.projectId, id),
      });
      return reply.send(rows);
    },
  );

  app.delete(
    "/projects/:id/backends/:backendId",
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const { id, backendId } = req.params as { id: string; backendId: string };

      const project = await db.query.projects.findFirst({
        where: and(eq(projects.id, id), eq(projects.userId, req.user.userId)),
      });
      if (!project) return reply.status(404).send({ error: "Project not found" });

      await db
        .delete(backends)
        .where(and(eq(backends.id, backendId), eq(backends.projectId, id)));
      invalidateBackend(backendId);
      return reply.send({ ok: true });
    },
  );
}
