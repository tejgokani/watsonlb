import cron from "node-cron";
import { checkAllBackends } from "./health-worker.js";
import { runMorningReports } from "./morning-report.js";
import { evictStaleWindows } from "./shield.js";
import { chargeShieldHourly } from "./billing.js";
import { db } from "../db/client.js";
import { sql } from "drizzle-orm";
import { config } from "../config.js";

export function startScheduler() {
  // Health checks every 5 minutes
  cron.schedule("*/5 * * * *", async () => {
    try {
      await checkAllBackends();
    } catch (err) {
      console.error("[health-worker] Uncaught error:", err);
    }
  });

  // Morning reports — check every 5 minutes (isReportWindow handles the 8am gate)
  cron.schedule("*/5 * * * *", async () => {
    try {
      await runMorningReports();
    } catch (err) {
      console.error("[morning-report] Uncaught error:", err);
    }
  });

  // Shield hourly billing — charge ₹0.20/hr for Starter/Free add-on users
  cron.schedule("0 * * * *", async () => {
    try {
      await chargeShieldHourly();
    } catch (err) {
      console.error("[shield-billing] Uncaught error:", err);
    }
  });

  // Evict stale Shield rate-limit windows every 10 minutes
  cron.schedule("*/10 * * * *", () => {
    evictStaleWindows();
  });

  // Neon keep-alive: ping every 4 minutes to prevent cold-start on serverless DB.
  // Neon suspends after ~5 min idle; this keeps it warm, cutting first-request
  // latency from ~500ms to ~2ms.
  cron.schedule("*/4 * * * *", async () => {
    try {
      await db.execute(sql`SELECT 1`);
    } catch {
      // Non-fatal — next real query will reconnect
    }
  });

  // Keep free-tier hosts (Render etc.) warm — ping own /health every 10 min
  // so the service doesn't spin down after 15 min of zero external traffic.
  // Only runs in production and not on localhost.
  if (config.NODE_ENV === "production" && !config.PROXY_BASE_URL.includes("localhost")) {
    cron.schedule("*/10 * * * *", async () => {
      try {
        await fetch(`${config.PROXY_BASE_URL}/health`);
      } catch {
        // Non-fatal
      }
    });
  }

  console.log("[scheduler] Health checks, morning reports, Shield janitor, DB keep-alive, and self-ping started");
}
