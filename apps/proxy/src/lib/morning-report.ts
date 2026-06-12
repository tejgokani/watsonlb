import { eq, and, gte, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { users, projects, backends, healthLogs, alerts } from "../db/schema.js";
import { sendMorningReport, type MorningReportBackend } from "./mailer.js";
import type { Plan } from "@watsonlb/shared";
import { PLAN_FEATURES } from "@watsonlb/shared";

/**
 * Returns true if the current time in the given IANA timezone is between
 * 08:00 and 08:05 (the 5-minute window for the morning report cron).
 */
export function isReportWindow(timezone: string, now: Date = new Date()): boolean {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    }).formatToParts(now);

    const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0");
    const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0");

    return hour === 8 && minute < 5;
  } catch {
    return false;
  }
}

/** Returns a YYYY-MM-DD string in the user's local timezone. */
export function localDateString(timezone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
}

/** Aggregates 24h of health logs for one backend into report data. */
export function aggregateBackendLogs(
  logs: Array<{ status: string; checkedAt: Date }>,
  backendUrl: string,
): MorningReportBackend {
  const total = logs.length;
  const downLogs = logs.filter((l) => l.status === "down");
  const upLogs = logs.filter((l) => l.status === "up");
  const uptimePct = total === 0 ? 100 : (upLogs.length / total) * 100;

  // Find contiguous down incidents
  const incidents: { startedAt: string; durationMinutes: number }[] = [];
  let incidentStart: Date | null = null;

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i]!;
    if (log.status === "down" && incidentStart === null) {
      incidentStart = log.checkedAt;
    } else if (log.status === "up" && incidentStart !== null) {
      const durationMs = log.checkedAt.getTime() - incidentStart.getTime();
      incidents.push({
        startedAt: incidentStart.toISOString().replace("T", " ").slice(0, 16),
        durationMinutes: Math.round(durationMs / 60_000),
      });
      incidentStart = null;
    }
  }
  // Still down at end of window
  if (incidentStart !== null) {
    const last = logs[logs.length - 1]!;
    const durationMs = last.checkedAt.getTime() - incidentStart.getTime();
    incidents.push({
      startedAt: incidentStart.toISOString().replace("T", " ").slice(0, 16),
      durationMinutes: Math.round(durationMs / 60_000),
    });
  }

  const longestOutageMinutes =
    incidents.length > 0
      ? Math.max(...incidents.map((i) => i.durationMinutes))
      : 0;

  return {
    url: backendUrl,
    uptimePct,
    totalChecks: total,
    downChecks: downLogs.length,
    longestOutageMinutes,
    incidents,
  };
}

/** Generates and sends morning reports for all eligible users. Called by cron every 5 min. */
export async function runMorningReports(now: Date = new Date()): Promise<void> {
  const allUsers = await db.query.users.findMany({
    columns: { id: true, email: true, plan: true, timezone: true },
  });

  const eligible = allUsers.filter(
    (u) => PLAN_FEATURES[u.plan as Plan].healthReports && isReportWindow(u.timezone, now),
  );

  if (eligible.length === 0) return;

  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  await Promise.allSettled(
    eligible.map(async (user) => {
      const today = localDateString(user.timezone, now);

      // Idempotency: skip if already sent today
      const alreadySent = await db.query.alerts.findFirst({
        where: and(
          eq(alerts.type, "morning_report"),
          gte(alerts.sentAt, new Date(today)),
        ),
      });
      if (alreadySent) return;

      const userProjects = await db.query.projects.findMany({
        where: eq(projects.userId, user.id),
        with: { backends: true },
      });

      const reportProjects = await Promise.all(
        userProjects.map(async (proj) => ({
          name: proj.name,
          backends: await Promise.all(
            proj.backends.map(async (b) => {
              const logs = await db.query.healthLogs.findMany({
                where: and(
                  eq(healthLogs.backendId, b.id),
                  gte(healthLogs.checkedAt, since),
                ),
                orderBy: [desc(healthLogs.checkedAt)],
                columns: { status: true, checkedAt: true },
              });
              return aggregateBackendLogs(
                logs.map((l) => ({ status: l.status, checkedAt: new Date(l.checkedAt) })),
                b.url,
              );
            }),
          ),
        })),
      );

      await sendMorningReport({
        toEmail: user.email,
        reportDate: today,
        projects: reportProjects,
      });

      // Record send so we don't duplicate
      const { nanoid } = await import("nanoid");
      await db.insert(alerts).values({
        id: nanoid(),
        projectId: userProjects[0]?.id ?? "system",
        type: "morning_report",
        channel: "email",
        payload: JSON.stringify({ date: today }),
      });
    }),
  );
}
