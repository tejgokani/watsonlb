import fp from "fastify-plugin";
import { FastifyInstance } from "fastify";

export const securityHeadersPlugin = fp(async (app: FastifyInstance) => {
  app.addHook("onSend", async (_req, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    reply.header(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
    // Remove fingerprinting headers
    reply.removeHeader("X-Powered-By");
    reply.removeHeader("Server");
  });
});
