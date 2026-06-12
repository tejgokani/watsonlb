import { FastifyInstance } from "fastify";
import crypto from "crypto";
import { config } from "../config.js";
import { activatePlan, deactivatePlan } from "../lib/billing.js";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import type { Plan } from "@watsonlb/shared";

function verifyRazorpaySignature(body: string, signature: string): boolean {
  // Bypass in dev mode — placeholder secret can't verify
  if (config.RAZORPAY_WEBHOOK_SECRET === "placeholder_webhook") {
    return config.NODE_ENV !== "production";
  }
  const expected = crypto
    .createHmac("sha256", config.RAZORPAY_WEBHOOK_SECRET)
    .update(body)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function webhookRoutes(app: FastifyInstance) {
  app.post(
    "/webhooks/razorpay",
    {
      config: { rawBody: true }, // need raw body for HMAC
    },
    async (req, reply) => {
      const signature = req.headers["x-razorpay-signature"] as string;
      const rawBody = (req as unknown as { rawBody: Buffer }).rawBody?.toString() ?? JSON.stringify(req.body);

      if (!verifyRazorpaySignature(rawBody, signature ?? "")) {
        app.log.warn("Invalid Razorpay webhook signature");
        return reply.status(400).send({ error: "Invalid signature" });
      }

      const event = req.body as { event: string; payload: Record<string, unknown> };
      app.log.info({ event: event.event }, "Razorpay webhook received");

      switch (event.event) {
        case "subscription.charged": {
          // Payment succeeded — activate plan
          const sub = (event.payload as Record<string, Record<string, unknown>>)["subscription"]?.["entity"] as Record<string, unknown>;
          const notes = sub?.["notes"] as Record<string, string> | undefined;
          const userId = notes?.["userId"];
          const plan = notes?.["plan"] as Plan | undefined;
          const paymentId = String(((event.payload as Record<string, Record<string, unknown>>)["payment"]?.["entity"] as Record<string, unknown> | undefined)?.["id"] ?? "");

          if (userId && plan) {
            await activatePlan(userId, plan, paymentId);
            app.log.info({ userId, plan }, "Plan activated via webhook");
          }
          break;
        }

        case "subscription.cancelled":
        case "subscription.completed": {
          const sub = (event.payload as Record<string, Record<string, unknown>>)["subscription"]?.["entity"] as Record<string, unknown>;
          const notes = sub?.["notes"] as Record<string, string> | undefined;
          const userId = notes?.["userId"];

          if (userId) {
            await deactivatePlan(userId);
            app.log.info({ userId }, "Plan deactivated via webhook");
          }
          break;
        }

        case "payment.failed": {
          // Log event type only — never log raw payload (may contain PII)
          app.log.warn("Payment failed (Razorpay will retry)");
          break;
        }

        default:
          app.log.info({ event: event.event }, "Unhandled webhook event");
      }

      return reply.status(200).send({ ok: true });
    },
  );

  // Dev-only: manually trigger a plan upgrade (simulates webhook)
  if (config.NODE_ENV !== "production") {
    app.post(
      "/webhooks/dev/upgrade",
      { onRequest: [app.authenticate] },
      async (req, reply) => {
        const { plan } = req.body as { plan: Plan };
        if (!["starter", "pro", "max", "free"].includes(plan)) {
          return reply.status(400).send({ error: "Invalid plan" });
        }
        if (plan === "free") {
          await deactivatePlan(req.user.userId);
        } else {
          await activatePlan(req.user.userId, plan, `dev_manual_${Date.now()}`);
        }
        return reply.send({ ok: true, plan });
      },
    );
  }
}
