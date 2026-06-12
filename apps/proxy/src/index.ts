import "./config.js"; // validate env at startup
import Fastify from "fastify";
import { config } from "./config.js";
import { authPlugin } from "./plugins/auth.js";
import { corsPlugin } from "./plugins/cors.js";
import { rateLimitPlugin } from "./plugins/rate-limit.js";
import { securityHeadersPlugin } from "./plugins/security-headers.js";
import { compressPlugin } from "./plugins/compress.js";
import { authRoutes } from "./routes/auth.js";
import { projectRoutes } from "./routes/projects.js";
import { proxyRoutes } from "./routes/proxy.js";
import { healthRoutes } from "./routes/health.js";
import { billingRoutes } from "./routes/billing.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { ctrlRoutes } from "./routes/ctrl.js";
import { oauthRoutes } from "./routes/oauth.js";
import { startScheduler } from "./lib/scheduler.js";

const app = Fastify({
  logger: config.NODE_ENV === "production"
    ? { level: "info" }
    : { level: config.NODE_ENV === "test" ? "silent" : "info", transport: { target: "pino-pretty" } },
  // Needed for proxy: preserve raw body for forwarding
  bodyLimit: 10 * 1024 * 1024, // 10 MB
});

await app.register(corsPlugin);
await app.register(rateLimitPlugin);
await app.register(compressPlugin);
await app.register(securityHeadersPlugin);
await app.register(authPlugin);

await app.register(authRoutes);
await app.register(projectRoutes);
await app.register(proxyRoutes);
await app.register(healthRoutes);
await app.register(billingRoutes);
await app.register(webhookRoutes);
await app.register(ctrlRoutes);
await app.register(oauthRoutes);

app.get("/health", async () => ({ status: "ok", ts: Date.now() }));

const start = async () => {
  try {
    await app.listen({ port: config.PORT, host: "0.0.0.0" });
    console.log(`WatsonLB proxy listening on port ${config.PORT}`);
    if (config.NODE_ENV !== "test") startScheduler();
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();

export { app };
