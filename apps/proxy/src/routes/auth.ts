import { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { config } from "../config.js";
import type { JWTPayload } from "@watsonlb/shared";

const registerBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  timezone: z.string().default("Asia/Kolkata"),
});

const loginBody = z.object({
  email: z.string().email(),
  password: z.string(),
});

// 10 attempts per IP per 15 minutes on auth endpoints
const authRateLimit = {
  config: { rateLimit: { max: 10, timeWindow: 15 * 60 * 1000 } },
};

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/register", authRateLimit, async (req, reply) => {
    const body = registerBody.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten().fieldErrors });
    }

    const { email, password, timezone } = body.data;

    const existing = await db.query.users.findFirst({
      where: eq(users.email, email),
    });
    if (existing) {
      return reply.status(409).send({ error: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const id = nanoid();

    await db.insert(users).values({ id, email, passwordHash, timezone });

    const payload: JWTPayload = { userId: id, email, plan: "free" };
    const token = app.jwt.sign(payload, { expiresIn: "30d" });

    return reply.status(201).send({ token });
  });

  app.post("/auth/login", authRateLimit, async (req, reply) => {
    const body = loginBody.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten().fieldErrors });
    }

    const { email, password } = body.data;

    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });
    if (!user) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    if (!user.passwordHash) {
      return reply.status(400).send({ error: "This account uses Google or GitHub sign-in. Please continue with OAuth." });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    // Auto-promote ADMIN_EMAIL on first login
    let isAdmin = user.isAdmin;
    if (config.ADMIN_EMAIL && user.email === config.ADMIN_EMAIL && !user.isAdmin) {
      await db.update(users).set({ isAdmin: true }).where(eq(users.id, user.id));
      isAdmin = true;
    }

    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      plan: user.plan,
      isAdmin,
    };
    const token = app.jwt.sign(payload, { expiresIn: "30d" });

    return reply.send({ token });
  });

  app.get(
    "/auth/me",
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const user = await db.query.users.findFirst({
        where: eq(users.id, req.user.userId),
        columns: {
          id: true,
          email: true,
          plan: true,
          timezone: true,
          firstWeekFree: true,
          createdAt: true,
        },
      });
      if (!user) return reply.status(404).send({ error: "User not found" });
      return reply.send(user);
    },
  );
}
