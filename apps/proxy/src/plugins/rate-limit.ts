import fp from "fastify-plugin";
import rateLimit from "@fastify/rate-limit";
import { FastifyInstance } from "fastify";

export const rateLimitPlugin = fp(async (app: FastifyInstance) => {
  await app.register(rateLimit, {
    // Global default: generous, just DoS protection
    global: true,
    max: 300,
    timeWindow: 60_000,
    skipOnError: true,
    // Use real IP — works behind Fly.io / Cloudflare which set X-Forwarded-For
    keyGenerator: (req) => {
      const forwarded = req.headers["x-forwarded-for"];
      const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0]?.trim();
      return ip ?? req.ip;
    },
    errorResponseBuilder: () => ({
      error: "Too many requests — slow down.",
      code: "RATE_LIMITED",
    }),
  });
});
