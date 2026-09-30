import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { tenants } from "./tenants";

export const tenantEmailSettings = pgTable("tenant_email_settings", {
  tenantId: uuid("tenant_id").primaryKey().references(() => tenants.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  host: text("host").notNull(),
  port: integer("port").notNull().default(587),
  encryption: text("encryption", { enum: ["starttls", "tls"] }).notNull().default("starttls"),
  username: text("username").notNull(),
  encryptedPassword: text("encrypted_password").notNull(),
  fromEmail: text("from_email").notNull(),
  fromName: text("from_name").notNull().default(""),
  allowedFrom: text("allowed_from").array().notNull().default([]),
  servername: text("servername").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// One atomic counter per tenant, shared across API tokens, admin tests and app instances.
export const tenantEmailRateLimits = pgTable("tenant_email_rate_limits", {
  tenantId: uuid("tenant_id").primaryKey().references(() => tenants.id, { onDelete: "cascade" }),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
  attempts: integer("attempts").notNull().default(1),
});
