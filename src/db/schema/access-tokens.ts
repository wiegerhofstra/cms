import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { tenants } from "./tenants";

export const accessTokens = pgTable(
  "access_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    tokenHint: text("token_hint").notNull(),
    permissions: text("permissions").array().notNull().default(["content:read"]),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("access_tokens_token_hash_unique").on(table.tokenHash),
    index("access_tokens_tenant_id_idx").on(table.tenantId),
    index("access_tokens_revoked_at_idx").on(table.revokedAt),
  ],
);

export const accessTokensRelations = relations(accessTokens, ({ one }) => ({
  tenant: one(tenants, {
    fields: [accessTokens.tenantId],
    references: [tenants.id],
  }),
  creator: one(user, {
    fields: [accessTokens.createdBy],
    references: [user.id],
  }),
}));
