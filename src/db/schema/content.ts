import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { tenants } from "./tenants";

export const modelStatus = pgEnum("model_status", ["active", "archived"]);
export const entryStatus = pgEnum("entry_status", ["draft", "published"]);
export const fieldType = pgEnum("field_type", [
  "text",
  "rich_text",
  "url",
  "number",
  "boolean",
  "date",
  "time",
  "enum",
  "asset",
  "component",
  "slug",
]);

export const contentModels = pgTable(
  "content_models",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: modelStatus("status").notNull().default("active"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("content_models_tenant_slug_unique").on(table.tenantId, table.slug),
    index("content_models_tenant_id_idx").on(table.tenantId),
    index("content_models_tenant_slug_idx").on(table.tenantId, table.slug),
  ],
);

export const contentModelFields = pgTable(
  "content_model_fields",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    modelId: uuid("model_id")
      .notNull()
      .references(() => contentModels.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: fieldType("type").notNull(),
    required: boolean("required").notNull().default(false),
    position: integer("position").notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    isList: boolean("is_list").notNull().default(false),
    isTitle: boolean("is_title").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("content_model_fields_model_key_unique").on(table.modelId, table.key),
    uniqueIndex("content_model_fields_model_title_unique").on(table.modelId).where(sql`${table.isTitle} = true`),
    index("content_model_fields_tenant_id_idx").on(table.tenantId),
    index("content_model_fields_model_id_idx").on(table.modelId),
  ],
);

export const contentModelFieldTargets = pgTable(
  "content_model_field_targets",
  {
    fieldId: uuid("field_id")
      .notNull()
      .references(() => contentModelFields.id, { onDelete: "cascade" }),
    targetModelId: uuid("target_model_id")
      .notNull()
      .references(() => contentModels.id, { onDelete: "restrict" }),
  },
  (table) => [
    uniqueIndex("content_model_field_targets_unique").on(table.fieldId, table.targetModelId),
    index("content_model_field_targets_field_id_idx").on(table.fieldId),
    index("content_model_field_targets_model_id_idx").on(table.targetModelId),
  ],
);

export const contentEntries = pgTable(
  "content_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    modelId: uuid("model_id")
      .notNull()
      .references(() => contentModels.id, { onDelete: "restrict" }),
    status: entryStatus("status").notNull().default("draft"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    parentEntryId: uuid("parent_entry_id"),
    parentFieldId: uuid("parent_field_id").references(() => contentModelFields.id, { onDelete: "set null" }),
    position: integer("position"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("content_entries_tenant_id_idx").on(table.tenantId),
    index("content_entries_tenant_model_status_idx").on(table.tenantId, table.modelId, table.status),
    index("content_entries_parent_position_idx").on(
      table.tenantId,
      table.parentEntryId,
      table.parentFieldId,
      table.position,
    ),
  ],
);

export const entryRevisions = pgTable(
  "entry_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => contentEntries.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("entry_revisions_entry_version_unique").on(table.entryId, table.version),
    index("entry_revisions_tenant_id_idx").on(table.tenantId),
  ],
);

export const contentModelsRelations = relations(contentModels, ({ many }) => ({
  fields: many(contentModelFields),
  entries: many(contentEntries),
}));

export const contentModelFieldsRelations = relations(contentModelFields, ({ one, many }) => ({
  model: one(contentModels, {
    fields: [contentModelFields.modelId],
    references: [contentModels.id],
  }),
  targets: many(contentModelFieldTargets),
}));

export const contentModelFieldTargetsRelations = relations(contentModelFieldTargets, ({ one }) => ({
  field: one(contentModelFields, {
    fields: [contentModelFieldTargets.fieldId],
    references: [contentModelFields.id],
  }),
  model: one(contentModels, {
    fields: [contentModelFieldTargets.targetModelId],
    references: [contentModels.id],
  }),
}));

export const contentEntriesRelations = relations(contentEntries, ({ one, many }) => ({
  model: one(contentModels, {
    fields: [contentEntries.modelId],
    references: [contentModels.id],
  }),
  revisions: many(entryRevisions),
}));

export const entryRevisionsRelations = relations(entryRevisions, ({ one }) => ({
  entry: one(contentEntries, {
    fields: [entryRevisions.entryId],
    references: [contentEntries.id],
  }),
}));
