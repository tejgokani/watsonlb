const BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("wlb_token") : null;

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? res.statusText);
  }

  return res.json() as Promise<T>;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export const auth = {
  register: (email: string, password: string, timezone?: string) =>
    apiFetch<{ token: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, timezone }),
    }),

  login: (email: string, password: string) =>
    apiFetch<{ token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: () =>
    apiFetch<{
      id: string;
      email: string;
      plan: string;
      timezone: string;
      createdAt: string;
    }>("/auth/me"),
};

// ── Projects ──────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  proxySlug: string;
  shieldEnabled: boolean;
  shieldRateLimit: number;
  shieldDailyCap: number | null;
  healthCheckInterval: number;
  createdAt: string;
  backends: Backend[];
}

export interface Backend {
  id: string;
  projectId: string;
  url: string;
  providerHint: string | null;
  active: boolean;
  circuitOpen: boolean;
  failureStreak: number;
  createdAt: string;
}

export interface HealthSummary {
  projectId: string;
  windowHours: number;
  backends: BackendHealth[];
}

export interface BackendHealth {
  backendId: string;
  url: string;
  uptimePct: number;
  totalChecks: number;
  downChecks: number;
  longestOutageMinutes: number;
  currentStatus: "up" | "down" | "unknown";
  circuitOpen: boolean;
  failureStreak: number;
  lastCheckedAt: string | null;
  lastResponseMs: number | null;
  incidents: { startedAt: string; durationMinutes: number }[];
  timeline: { t: string; s: string; ms: number | null }[];
}

export const projects = {
  list: () => apiFetch<Project[]>("/projects"),

  get: (id: string) => apiFetch<Project>(`/projects/${id}`),

  create: (name: string) =>
    apiFetch<{ id: string; proxySlug: string }>("/projects", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  delete: (id: string) =>
    apiFetch<{ ok: boolean }>(`/projects/${id}`, { method: "DELETE" }),

  updateShield: (id: string, enabled: boolean, rateLimit?: number) =>
    apiFetch<{ ok: boolean }>(`/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ shieldEnabled: enabled, ...(rateLimit ? { shieldRateLimit: rateLimit } : {}) }),
    }),

  health: (id: string, hours = 24) =>
    apiFetch<HealthSummary>(`/projects/${id}/health?hours=${hours}`),
};

// ── Billing ───────────────────────────────────────────────────────────────────

export interface BillingSummary {
  plan: string;
  effectivePlan: string;
  isFirstWeekFree: boolean;
  firstWeekEndsAt: string;
  lastPayment: { plan: string; amount: number; createdAt: string } | null;
  shieldSpendThisWeek: number;
  suggestUpgrade: boolean;
}

export const billingApi = {
  summary: () => apiFetch<BillingSummary>("/billing"),

  subscribe: (plan: "starter" | "pro" | "max") =>
    apiFetch<{ devMode?: boolean; message?: string; plan: string; subscriptionId?: string; paymentLink?: string }>(
      "/billing/subscribe",
      { method: "POST", body: JSON.stringify({ plan }) },
    ),

  cancel: () =>
    apiFetch<{ devMode?: boolean; message: string }>("/billing/cancel", { method: "POST" }),

  // Dev-only: instantly flip plan without Razorpay
  devUpgrade: (plan: string) =>
    apiFetch<{ ok: boolean; plan: string }>("/webhooks/dev/upgrade", {
      method: "POST",
      body: JSON.stringify({ plan }),
    }),
};

export const backendsApi = {
  add: (projectId: string, url: string, providerHint?: string) =>
    apiFetch<{ id: string }>(`/projects/${projectId}/backends`, {
      method: "POST",
      body: JSON.stringify({ url, providerHint }),
    }),

  remove: (projectId: string, backendId: string) =>
    apiFetch<{ ok: boolean }>(`/projects/${projectId}/backends/${backendId}`, {
      method: "DELETE",
    }),
};
