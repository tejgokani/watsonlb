import { relations } from "drizzle-orm";
import {
  users,
  projects,
  backends,
  healthLogs,
  alerts,
  shieldSessions,
  dbConnections,
  billing,
} from "./schema.js";

export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
  billing: many(billing),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, { fields: [projects.userId], references: [users.id] }),
  backends: many(backends),
  alerts: many(alerts),
  shieldSessions: many(shieldSessions),
  dbConnections: many(dbConnections),
}));

export const backendsRelations = relations(backends, ({ one, many }) => ({
  project: one(projects, { fields: [backends.projectId], references: [projects.id] }),
  healthLogs: many(healthLogs),
}));

export const healthLogsRelations = relations(healthLogs, ({ one }) => ({
  backend: one(backends, { fields: [healthLogs.backendId], references: [backends.id] }),
}));

export const alertsRelations = relations(alerts, ({ one }) => ({
  project: one(projects, { fields: [alerts.projectId], references: [projects.id] }),
}));

export const shieldSessionsRelations = relations(shieldSessions, ({ one }) => ({
  project: one(projects, { fields: [shieldSessions.projectId], references: [projects.id] }),
}));

export const dbConnectionsRelations = relations(dbConnections, ({ one }) => ({
  project: one(projects, { fields: [dbConnections.projectId], references: [projects.id] }),
}));

export const billingRelations = relations(billing, ({ one }) => ({
  user: one(users, { fields: [billing.userId], references: [users.id] }),
}));
