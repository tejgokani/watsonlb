import { FastifyInstance } from "fastify";
import { eq, sql, desc, ilike, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { users, projects, backends, billing, alerts } from "../db/schema.js";

const updateUserBody = z.object({
  plan: z.enum(["free", "starter", "pro", "max"]).optional(),
  isAdmin: z.boolean().optional(),
});

const updateProjectBody = z.object({
  shieldEnabled: z.boolean().optional(),
});

export async function ctrlRoutes(app: FastifyInstance) {
  const admin = () => ({ onRequest: [app.authenticateAdmin] });

  // ── Stats ──────────────────────────────────────────────────────────────────

  app.get("/ctrl/stats", admin(), async (_req, reply) => {
    const [userStats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        free: sql<number>`count(*) filter (where plan = 'free')::int`,
        starter: sql<number>`count(*) filter (where plan = 'starter')::int`,
        pro: sql<number>`count(*) filter (where plan = 'pro')::int`,
        max: sql<number>`count(*) filter (where plan = 'max')::int`,
        newToday: sql<number>`count(*) filter (where created_at > now() - interval '24 hours')::int`,
      })
      .from(users);

    const [projectStats] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(projects);

    const [backendStats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where active = true)::int`,
        circuitOpen: sql<number>`count(*) filter (where circuit_open = true)::int`,
      })
      .from(backends);

    const [revenueStats] = await db
      .select({
        weekTotal: sql<number>`coalesce(sum(amount), 0)::real`,
        allTime: sql<number>`coalesce(sum(amount), 0)::real`,
      })
      .from(billing)
      .where(sql`created_at > now() - interval '7 days'`);

    const [alertStats] = await db
      .select({ last24h: sql<number>`count(*)::int` })
      .from(alerts)
      .where(sql`sent_at > now() - interval '24 hours'`);

    const recentUsers = await db
      .select({ id: users.id, email: users.email, plan: users.plan, createdAt: users.createdAt })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(5);

    return reply.send({
      users: userStats,
      projects: projectStats,
      backends: backendStats,
      revenue: revenueStats,
      alerts: alertStats,
      recentUsers,
    });
  });

  // ── Users ──────────────────────────────────────────────────────────────────

  app.get("/ctrl/users", admin(), async (req, reply) => {
    const query = (req.query as { page?: string; search?: string });
    const page = Math.max(1, parseInt(query.page ?? "1", 10));
    const search = query.search?.trim() ?? "";
    const limit = 20;
    const offset = (page - 1) * limit;

    const where = search ? ilike(users.email, `%${search}%`) : undefined;

    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        plan: users.plan,
        isAdmin: users.isAdmin,
        createdAt: users.createdAt,
        projectCount: sql<number>`(select count(*) from projects where user_id = users.id)::int`,
        backendCount: sql<number>`(select count(*) from backends b join projects p on b.project_id = p.id where p.user_id = users.id)::int`,
      })
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);

    const countRows = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(users)
      .where(where);
    const total = countRows[0]?.total ?? 0;

    return reply.send({ users: rows, total, page, pages: Math.ceil(total / limit) });
  });

  app.patch("/ctrl/users/:id", admin(), async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateUserBody.safeParse(req.body);
    if (!body.success)
      return reply.status(400).send({ error: body.error.flatten().fieldErrors });

    const update: Partial<typeof users.$inferInsert> = {};
    if (body.data.plan !== undefined) update.plan = body.data.plan;
    if (body.data.isAdmin !== undefined) update.isAdmin = body.data.isAdmin;

    if (Object.keys(update).length === 0)
      return reply.status(400).send({ error: "Nothing to update" });

    await db.update(users).set(update).where(eq(users.id, id));
    return reply.send({ ok: true });
  });

  app.delete("/ctrl/users/:id", admin(), async (req, reply) => {
    const { id } = req.params as { id: string };
    // Prevent self-deletion
    if (id === req.user.userId)
      return reply.status(400).send({ error: "Cannot delete your own account" });

    await db.delete(users).where(eq(users.id, id));
    return reply.send({ ok: true });
  });

  // ── Projects ───────────────────────────────────────────────────────────────

  app.get("/ctrl/projects", admin(), async (req, reply) => {
    const query = (req.query as { page?: string; userId?: string });
    const page = Math.max(1, parseInt(query.page ?? "1", 10));
    const limit = 20;
    const offset = (page - 1) * limit;

    const where = query.userId ? eq(projects.userId, query.userId) : undefined;

    const rows = await db
      .select({
        id: projects.id,
        name: projects.name,
        proxySlug: projects.proxySlug,
        shieldEnabled: projects.shieldEnabled,
        createdAt: projects.createdAt,
        userId: projects.userId,
        ownerEmail: sql<string>`(select email from users where id = projects.user_id)`,
        backendCount: sql<number>`(select count(*) from backends where project_id = projects.id)::int`,
        activeBackends: sql<number>`(select count(*) from backends where project_id = projects.id and active = true)::int`,
      })
      .from(projects)
      .where(where)
      .orderBy(desc(projects.createdAt))
      .limit(limit)
      .offset(offset);

    const countRows2 = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(projects)
      .where(where);
    const total = countRows2[0]?.total ?? 0;

    return reply.send({ projects: rows, total, page, pages: Math.ceil(total / limit) });
  });

  app.delete("/ctrl/projects/:id", admin(), async (req, reply) => {
    const { id } = req.params as { id: string };
    await db.delete(projects).where(eq(projects.id, id));
    return reply.send({ ok: true });
  });
}
