import { pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { consumerType, tenants } from "./tenants";

export const tenantRevalidationSettings = pgTable("tenant_revalidation_settings", {
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  consumerType: consumerType("consumer_type").notNull().default("nextjs"),
  lastDeploymentId: text("last_deployment_id"),
  url: text("url").notNull(),
  encryptedToken: text("encrypted_token").notNull(),
  lastRevalidatedAt: timestamp("last_revalidated_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.tenantId, table.consumerType] })]);
