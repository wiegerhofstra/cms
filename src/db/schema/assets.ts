import { bigint, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { tenants } from "./tenants";

export const assetStatus = pgEnum("asset_status", ["pending", "ready", "deleted"]);

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    uploadedBy: text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
    bucket: text("bucket").notNull(),
    objectKey: text("object_key").notNull(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    imageWidth: integer("image_width"),
    imageHeight: integer("image_height"),
    etag: text("etag"),
    status: assetStatus("status").notNull().default("pending"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("assets_tenant_object_key_unique").on(table.tenantId, table.objectKey),
    index("assets_tenant_id_idx").on(table.tenantId),
    index("assets_tenant_status_created_at_idx").on(table.tenantId, table.status, table.createdAt),
    index("assets_tenant_mime_type_idx").on(table.tenantId, table.mimeType),
  ],
);
