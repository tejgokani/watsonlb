import { eq, and, gte, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db/client.js";
import { users, billing, shieldSessions, projects, alerts } from "../db/schema.js";
import { sendMorningReport } from "./mailer.js";
import type { Plan } from "@watsonlb/shared";
import { PLAN_FEATURES } from "@watsonlb/shared";

export const SHIELD_RATE_PER_HOUR = 0.20; // ₹
export const SHIELD_WARN_THRESHOLD_DAILY = 60; // ₹ — approaching Pro weekly price

/** Returns true if user is still in their free first week. */
export function isFirstWeekFree(createdAt: Date): boolean {
  const msInWeek = 7 * 24 * 60 * 60 * 1000;
  return Date.now() - createdAt.getTime() < msInWeek;
}

/** Effective plan for feature gating — first-week users get Pro features. */
export function effectivePlan(plan: Plan, createdAt: Date): Plan {
  if (isFirstWeekFree(createdAt)) return "pro";
  return plan;
}

/**
 * Charges Shield hourly for Starter/Free users who have Shield add-on enabled.
 * Called by cron every hour.
 */
export async function chargeShieldHourly(): Promise<void> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  // Find all active (non-ended) shield sessions
  const activeSessions = await db.query.shieldSessions.findMany({
    where: eq(shieldSessions.endedAt, null as never),
    with: { project: { with: { user: true } } },
  });

  for (const session of activeSessions) {
    if (!session.project?.user) continue;

    const user = session.project.user;
    const plan = user.plan as Plan;

    // Pro/Max have Shield included — don't charge hourly
    if (plan === "pro" || plan === "max") continue;

    // Charge ₹0.20 per hour
    const hoursCharged = session.hoursCharged + 1;

    await db
      .update(shieldSessions)
      .set({ hoursCharged })
      .where(eq(shieldSessions.id, session.id));

    await db.insert(billing).values({
      id: nanoid(),
      userId: user.id,
      plan: plan as never,
      amount: SHIELD_RATE_PER_HOUR,
      razorpayRef: `shield_${session.id}_h${hoursCharged}`,
    });

    // Check daily spend — warn if approaching Pro weekly price
    const todayCharges = await db.query.billing.findMany({
      where: and(
        eq(billing.userId, user.id),
        gte(billing.createdAt, todayStart),
      ),
    });

    const dailyTotal = todayCharges.reduce((sum, b) => sum + b.amount, 0);

    if (dailyTotal >= SHIELD_WARN_THRESHOLD_DAILY) {
      const alreadyWarned = await db.query.alerts.findFirst({
        where: and(
          eq(alerts.type, "morning_report"), // reuse type as "billing_warn" conceptually
          gte(alerts.sentAt, todayStart),
        ),
      });

      if (!alreadyWarned) {
        // Fire-and-forget warning email — skip if Resend not configured
        const resendKey = process.env["RESEND_API_KEY"];
        if (resendKey && resendKey !== "re_placeholder") import("resend").then(({ Resend }) => {
            const resend = new Resend(resendKey);
            resend.emails.send({
              from: "WatsonLB <alerts@watsonlb.dev>",
              to: user.email,
              subject: "Shield spend approaching Pro tier — consider upgrading",
              text: [
                `Your Shield add-on has cost ₹${dailyTotal.toFixed(2)} today.`,
                `At this rate, upgrading to Pro (₹75/week) saves you money and unlocks real-time alerts.`,
                `Log in to upgrade: https://watsonlb.dev/dashboard/billing`,
              ].join("\n"),
            });
          });
      }
    }
  }
}

/** Creates or updates a billing record after successful Razorpay payment. */
export async function activatePlan(
  userId: string,
  plan: Plan,
  razorpayRef: string,
): Promise<void> {
  const weekStart = new Date();

  await db
    .update(users)
    .set({ plan, firstWeekFree: false })
    .where(eq(users.id, userId));

  await db.insert(billing).values({
    id: nanoid(),
    userId,
    plan,
    weekStart,
    amount: ({ starter: 50, pro: 75, max: 100 } as Record<string, number>)[plan] ?? 0,
    razorpayRef,
  });
}

/** Downgrades user to free when subscription is cancelled. */
export async function deactivatePlan(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ plan: "free" })
    .where(eq(users.id, userId));
}

/** Returns the current billing summary for a user. */
export async function getBillingSummary(userId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, plan: true, firstWeekFree: true, createdAt: true },
  });
  if (!user) return null;

  const lastPayment = await db.query.billing.findFirst({
    where: and(eq(billing.userId, userId)),
    orderBy: [desc(billing.createdAt)],
  });

  // Calculate Shield spend this week
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const weeklyShieldCharges = await db.query.billing.findMany({
    where: and(
      eq(billing.userId, userId),
      gte(billing.createdAt, weekStart),
    ),
  });

  const shieldSpendThisWeek = weeklyShieldCharges
    .filter((b) => b.razorpayRef?.startsWith("shield_"))
    .reduce((sum, b) => sum + b.amount, 0);

  const firstWeekEndsAt = new Date(user.createdAt);
  firstWeekEndsAt.setDate(firstWeekEndsAt.getDate() + 7);

  return {
    plan: user.plan as Plan,
    effectivePlan: effectivePlan(user.plan as Plan, new Date(user.createdAt)),
    isFirstWeekFree: isFirstWeekFree(new Date(user.createdAt)),
    firstWeekEndsAt,
    lastPayment,
    shieldSpendThisWeek,
    // Suggest upgrade if Shield spend this week ≥ 70% of Pro price
    suggestUpgrade: shieldSpendThisWeek >= 75 * 0.7,
  };
}
