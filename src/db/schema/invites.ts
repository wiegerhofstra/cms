import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";

export type InviteMembership = { tenantId: string; role: "owner" | "editor" };

/** Single-use links that let an administrator invite someone to create their own account. */
export const userInvites = pgTable(
  "user_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull(),
    // When set, only this address can accept the invite.
    email: text("email"),
    role: text("role").notNull().default("user"),
    memberships: jsonb("memberships").$type<InviteMembership[]>().notNull().default([]),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    acceptedBy: text("accepted_by").references(() => user.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_invites_token_hash_unique").on(table.tokenHash),
    index("user_invites_created_at_idx").on(table.createdAt),
  ],
);
