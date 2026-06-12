import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  real,
  pgEnum,
} from "drizzle-orm/pg-core";

export const planEnum = pgEnum("plan", ["free", "starter", "pro", "max"]);
export const backendStatusEnum = pgEnum("backend_status", [
  "up",
  "down",
  "unknown",
]);
export const alertTypeEnum = pgEnum("alert_type", [
  "backend_down",
  "backend_recovered",
  "morning_report",
]);
export const alertChannelEnum = pgEnum("alert_channel", ["email", "whatsapp"]);
export const dbRoleEnum = pgEnum("db_role", ["primary", "replica"]);

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  googleId: text("google_id").unique(),
  githubId: text("github_id").unique(),
  plan: planEnum("plan").notNull().default("free"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  firstWeekFree: boolean("first_week_free").notNull().default(true),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  proxySlug: text("proxy_slug").notNull().unique(),
  maintenanceHtml: text("maintenance_html"),
  shieldEnabled: boolean("shield_enabled").notNull().default(false),
  shieldRateLimit: integer("shield_rate_limit").notNull().default(60),
  shieldDailyCap: real("shield_daily_cap"),
  healthCheckInterval: integer("health_check_interval").notNull().default(5),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const backends = pgTable("backends", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  providerHint: text("provider_hint"),
  active: boolean("active").notNull().default(true),
  failureStreak: integer("failure_streak").notNull().default(0),
  circuitOpen: boolean("circuit_open").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const healthLogs = pgTable("health_logs", {
  id: text("id").primaryKey(),
  backendId: text("backend_id")
    .notNull()
    .references(() => backends.id, { onDelete: "cascade" }),
  status: backendStatusEnum("status").notNull(),
  responseMs: integer("response_ms"),
  statusCode: integer("status_code"),
  checkedAt: timestamp("checked_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const alerts = pgTable("alerts", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  type: alertTypeEnum("type").notNull(),
  channel: alertChannelEnum("channel").notNull(),
  payload: text("payload"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});

export const shieldSessions = pgTable("shield_sessions", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  requestsBlocked: integer("requests_blocked").notNull().default(0),
  hoursCharged: real("hours_charged").notNull().default(0),
});

export const dbConnections = pgTable("db_connections", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  connectionString: text("connection_string").notNull(),
  role: dbRoleEnum("role").notNull().default("primary"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const billing = pgTable("billing", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  plan: planEnum("plan").notNull(),
  weekStart: timestamp("week_start", { withTimezone: true }),
  amount: real("amount").notNull(),
  razorpayRef: text("razorpay_ref"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
