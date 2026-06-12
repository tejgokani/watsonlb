export type Plan = "free" | "starter" | "pro" | "max";
export type BackendStatus = "up" | "down" | "unknown";
export type AlertChannel = "email" | "whatsapp";
export type AlertType = "backend_down" | "backend_recovered" | "morning_report";
export type DBRole = "primary" | "replica";

export interface JWTPayload {
  userId: string;
  email: string;
  plan: Plan;
  isAdmin?: boolean;
}

export interface ProxyRequest {
  projectId: string;
  path: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
}

export const PLAN_BACKEND_LIMITS: Record<Plan, number> = {
  free: 2,
  starter: 2,
  pro: 4,
  max: Infinity,
};

export const PLAN_FEATURES = {
  free: {
    healthReports: false,
    realTimeAlerts: false,
    shield: false,
    shieldAddon: false,
    healthCheckIntervalMin: 5,
  },
  starter: {
    healthReports: true,
    realTimeAlerts: false,
    shield: false,
    shieldAddon: true,
    healthCheckIntervalMin: 5,
  },
  pro: {
    healthReports: true,
    realTimeAlerts: true,
    shield: true,
    shieldAddon: false,
    healthCheckIntervalMin: 1,
  },
  max: {
    healthReports: true,
    realTimeAlerts: true,
    shield: true,
    shieldAddon: false,
    healthCheckIntervalMin: 1,
  },
} satisfies Record<Plan, object>;
