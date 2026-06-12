import { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import {
  getRazorpay,
  hasRealCredentials,
  PLAN_AMOUNTS_WEEKLY,
  PLAN_NAMES,
} from "../lib/razorpay-client.js";
import { getBillingSummary, activatePlan } from "../lib/billing.js";
import type { Plan } from "@watsonlb/shared";

const upgradeBody = z.object({
  plan: z.enum(["starter", "pro", "max"]),
});

export async function billingRoutes(app: FastifyInstance) {
  // GET /billing — current plan + spend summary
  app.get(
    "/billing",
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const summary = await getBillingSummary(req.user.userId);
      if (!summary) return reply.status(404).send({ error: "User not found" });
      return reply.send(summary);
    },
  );

  // POST /billing/subscribe — create Razorpay subscription or dev-mode stub
  app.post(
    "/billing/subscribe",
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const body = upgradeBody.safeParse(req.body);
      if (!body.success)
        return reply.status(400).send({ error: body.error.flatten().fieldErrors });

      const { plan } = body.data;
      const currentUser = await db.query.users.findFirst({
        where: eq(users.id, req.user.userId),
      });
      if (!currentUser) return reply.status(404).send({ error: "User not found" });

      // Already on this plan
      if (currentUser.plan === plan)
        return reply.status(409).send({ error: `Already on ${plan} plan` });

      // Dev-mode stub — activate immediately without Razorpay
      if (!hasRealCredentials()) {
        await activatePlan(req.user.userId, plan, `dev_stub_${Date.now()}`);
        return reply.send({
          devMode: true,
          message: `Plan upgraded to ${plan}. (Dev mode — no payment processed)`,
          plan,
        });
      }

      // Production — create Razorpay subscription
      try {
        const rzp = getRazorpay();

        // Create a subscription plan if not cached (idempotent by name in prod)
        const rzpPlan = await rzp.plans.create({
          period: "weekly",
          interval: 1,
          item: {
            name: PLAN_NAMES[plan] ?? plan,
            amount: PLAN_AMOUNTS_WEEKLY[plan] ?? 0,
            currency: "INR",
          },
        });

        const subscription = await rzp.subscriptions.create({
          plan_id: rzpPlan.id,
          customer_notify: 1,
          total_count: 52, // 1 year of weekly billing
          quantity: 1,
          addons: [],
          notes: {
            userId: req.user.userId,
            plan,
          },
        });

        return reply.send({
          subscriptionId: subscription.id,
          paymentLink: `https://rzp.io/l/${subscription.id}`,
          plan,
        });
      } catch (err: unknown) {
        app.log.error(err, "Razorpay subscription creation failed");
        return reply.status(502).send({ error: "Payment provider error. Try again." });
      }
    },
  );

  // POST /billing/cancel — cancel subscription (dev stub or Razorpay)
  app.post(
    "/billing/cancel",
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      if (!hasRealCredentials()) {
        await db.update(users).set({ plan: "free" }).where(eq(users.id, req.user.userId));
        return reply.send({ devMode: true, message: "Plan downgraded to free. (Dev mode)" });
      }

      // In prod, cancellation is handled by Razorpay webhook
      return reply.send({
        message: "Cancel your subscription in the Razorpay dashboard. Plan downgrades at next billing cycle.",
      });
    },
  );
}
