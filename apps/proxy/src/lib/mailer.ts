import { Resend } from "resend";
import { config } from "../config.js";

const hasResend = config.RESEND_API_KEY !== "re_placeholder";

let _resend: Resend | null = null;
function resend() {
  if (!_resend) _resend = new Resend(config.RESEND_API_KEY);
  return _resend;
}

const FROM = "WatsonLB <alerts@watsonlb.dev>";

// ── Alert emails ──────────────────────────────────────────────────────────────

export interface BackendDownPayload {
  toEmail: string;
  projectName: string;
  backendUrl: string;
  failureStreak: number;
}

export async function sendBackendDownAlert(p: BackendDownPayload) {
  if (!hasResend) return;
  return resend().emails.send({
    from: FROM,
    to: p.toEmail,
    subject: `⚠ Backend down in ${p.projectName}`,
    html: backendDownHtml(p),
    text: backendDownText(p),
  });
}

function backendDownText(p: BackendDownPayload) {
  return [
    `WatsonLB Alert — Backend Down`,
    ``,
    `Project: ${p.projectName}`,
    `Backend: ${p.backendUrl}`,
    `Failed health checks: ${p.failureStreak} in a row`,
    ``,
    `Traffic has been automatically rerouted to your healthy backends.`,
    `You'll get another email when this backend recovers.`,
  ].join("\n");
}

function backendDownHtml(p: BackendDownPayload) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
  <h2 style="color:#dc2626">⚠ Backend Down</h2>
  <p><strong>Project:</strong> ${esc(p.projectName)}</p>
  <p><strong>Backend:</strong> <code>${esc(p.backendUrl)}</code></p>
  <p><strong>Failed checks:</strong> ${p.failureStreak} consecutive</p>
  <p>Traffic has been automatically rerouted to your healthy backends.
     You'll get another email when this backend recovers.</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
  <p style="color:#6b7280;font-size:12px">WatsonLB — keeping your app alive</p>
</body></html>`;
}

// ── Recovery email ────────────────────────────────────────────────────────────

export interface BackendRecoveredPayload {
  toEmail: string;
  projectName: string;
  backendUrl: string;
  downForMs: number;
}

export async function sendBackendRecoveredAlert(p: BackendRecoveredPayload) {
  if (!hasResend) return;
  const downMinutes = Math.round(p.downForMs / 60_000);
  return resend().emails.send({
    from: FROM,
    to: p.toEmail,
    subject: `✓ Backend recovered in ${p.projectName}`,
    html: recoveredHtml(p, downMinutes),
    text: recoveredText(p, downMinutes),
  });
}

function recoveredText(p: BackendRecoveredPayload, downMinutes: number) {
  return [
    `WatsonLB — Backend Recovered`,
    ``,
    `Project: ${p.projectName}`,
    `Backend: ${p.backendUrl}`,
    `Was down for approximately ${downMinutes} minutes.`,
    ``,
    `Traffic has been restored to this backend.`,
  ].join("\n");
}

function recoveredHtml(p: BackendRecoveredPayload, downMinutes: number) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
  <h2 style="color:#16a34a">✓ Backend Recovered</h2>
  <p><strong>Project:</strong> ${esc(p.projectName)}</p>
  <p><strong>Backend:</strong> <code>${esc(p.backendUrl)}</code></p>
  <p>Was unreachable for approximately <strong>${downMinutes} minute${downMinutes !== 1 ? "s" : ""}</strong>.</p>
  <p>Traffic has been restored to this backend.</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
  <p style="color:#6b7280;font-size:12px">WatsonLB — keeping your app alive</p>
</body></html>`;
}

// ── Morning report ────────────────────────────────────────────────────────────

export interface MorningReportPayload {
  toEmail: string;
  reportDate: string;
  projects: MorningReportProject[];
}

export interface MorningReportProject {
  name: string;
  backends: MorningReportBackend[];
}

export interface MorningReportBackend {
  url: string;
  uptimePct: number;
  totalChecks: number;
  downChecks: number;
  longestOutageMinutes: number;
  incidents: { startedAt: string; durationMinutes: number }[];
}

export async function sendMorningReport(p: MorningReportPayload) {
  if (!hasResend) return;
  const allHealthy = p.projects.every((proj) =>
    proj.backends.every((b) => b.downChecks === 0),
  );

  return resend().emails.send({
    from: FROM,
    to: p.toEmail,
    subject: allHealthy
      ? `✓ All backends healthy — ${p.reportDate}`
      : `📋 Health report — ${p.reportDate}`,
    html: morningReportHtml(p, allHealthy),
    text: morningReportText(p, allHealthy),
  });
}

function morningReportText(p: MorningReportPayload, allHealthy: boolean) {
  const lines = [
    `WatsonLB — Daily Health Report (${p.reportDate})`,
    ``,
  ];
  if (allHealthy) {
    lines.push("All backends were healthy in the last 24 hours. No downtime.");
  } else {
    for (const proj of p.projects) {
      lines.push(`Project: ${proj.name}`);
      for (const b of proj.backends) {
        lines.push(`  ${b.url}`);
        lines.push(`  Uptime: ${b.uptimePct.toFixed(1)}%`);
        if (b.incidents.length > 0) {
          for (const inc of b.incidents) {
            lines.push(
              `  — Down at ${inc.startedAt} for ${inc.durationMinutes} min`,
            );
          }
        }
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}

function morningReportHtml(p: MorningReportPayload, allHealthy: boolean) {
  const rows = allHealthy
    ? `<p style="color:#16a34a;font-weight:600">✓ All backends healthy. No downtime in the last 24 hours.</p>`
    : p.projects
        .map(
          (proj) => `
    <h3>${esc(proj.name)}</h3>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead><tr style="background:#f9fafb">
        <th style="text-align:left;padding:8px;border:1px solid #e5e7eb">Backend</th>
        <th style="text-align:right;padding:8px;border:1px solid #e5e7eb">Uptime</th>
        <th style="text-align:right;padding:8px;border:1px solid #e5e7eb">Incidents</th>
      </tr></thead>
      <tbody>
        ${proj.backends
          .map(
            (b) => `
        <tr>
          <td style="padding:8px;border:1px solid #e5e7eb"><code>${esc(b.url)}</code></td>
          <td style="text-align:right;padding:8px;border:1px solid #e5e7eb;color:${b.uptimePct < 99 ? "#dc2626" : "#16a34a"}">${b.uptimePct.toFixed(1)}%</td>
          <td style="text-align:right;padding:8px;border:1px solid #e5e7eb">${b.incidents.length}</td>
        </tr>
        ${b.incidents.map((i) => `<tr style="background:#fff7f7"><td colspan="3" style="padding:4px 8px;border:1px solid #e5e7eb;font-size:12px;color:#6b7280">↳ Down at ${esc(i.startedAt)} for ${i.durationMinutes} min</td></tr>`).join("")}`,
          )
          .join("")}
      </tbody>
    </table>`,
        )
        .join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2>Daily Health Report — ${esc(p.reportDate)}</h2>
  ${rows}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
  <p style="color:#6b7280;font-size:12px">WatsonLB — keeping your app alive</p>
</body></html>`;
}

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
