import { and, eq, inArray, max, ne, sql } from "drizzle-orm";

import { type Db } from "@/db";
import { contentEntries, contentModelFields, contentModelFieldTargets, contentModels, entryRevisions } from "@/db/schema";
import { CmsError as ApiError } from "@/lib/cms/errors";
import { isEmptyRichTextDocument } from "@/lib/rich-text";
import { isValidTimeValue } from "./time";

type ContentModelFieldRow = typeof contentModelFields.$inferSelect;
type EntryReadDb = Pick<Db, "select">;

const slugPattern = /^[a-z0-9_-]+$/;

export async function createEntryRevision(
  tx: Parameters<Parameters<Db["transaction"]>[0]>[0],
  input: {
    tenantId: string;
    entryId: string;
    data: Record<string, unknown>;
    userId: string;
  },
): Promise<void> {
  const [versionRow] = await tx
    .select({ value: max(entryRevisions.version) })
    .from(entryRevisions)
    .where(and(eq(entryRevisions.tenantId, input.tenantId), eq(entryRevisions.entryId, input.entryId)));

  await tx.insert(entryRevisions).values({
    tenantId: input.tenantId,
    entryId: input.entryId,
    version: (versionRow?.value ?? 0) + 1,
    data: input.data,
    createdBy: input.userId,
  });
}

export async function getTenantEntry(db: EntryReadDb, tenantId: string, entryId: string) {
  const [entry] = await db
    .select()
    .from(contentEntries)
    .where(and(eq(contentEntries.tenantId, tenantId), eq(contentEntries.id, entryId), sql`${contentEntries.deletedAt} is null`))
    .limit(1);

  return entry ?? null;
}

export async function getActiveModel(db: Db, tenantId: string, modelId: string) {
  const [model] = await db
    .select()
    .from(contentModels)
    .where(and(eq(contentModels.tenantId, tenantId), eq(contentModels.id, modelId)))
    .limit(1);

  if (!model) {
    throw new ApiError("NOT_FOUND", "Model was not found");
  }

  if (model.status === "archived") {
    throw new ApiError("CONFLICT", "Archived models do not accept new entry changes");
  }

  return model;
}

export async function validateEntryData(
  db: EntryReadDb,
  tenantId: string,
  modelId: string,
  data: Record<string, unknown>,
  excludeEntryId?: string,
): Promise<void> {
  const fields = await db
    .select()
    .from(contentModelFields)
    .where(and(eq(contentModelFields.tenantId, tenantId), eq(contentModelFields.modelId, modelId)))
    .orderBy(contentModelFields.position);

  await validateSlugFields(db, tenantId, modelId, fields, data, excludeEntryId);
  validateUrlFields(fields, data);
  validateTimeFields(fields, data);
}

export async function validateEntryForPublish(db: EntryReadDb, tenantId: string, entryId: string): Promise<void> {
  const entry = await getTenantEntry(db, tenantId, entryId);
  if (!entry) {
    throw new ApiError("NOT_FOUND", "Entry was not found");
  }

  await validateEntryDataForPublish(db, tenantId, entry.modelId, entry.data, entry.id);
}

export async function validateEntryDataForPublish(
  db: EntryReadDb,
  tenantId: string,
  modelId: string,
  data: Record<string, unknown>,
  excludeEntryId?: string,
): Promise<void> {
  const fields = await db
    .select()
    .from(contentModelFields)
    .where(and(eq(contentModelFields.tenantId, tenantId), eq(contentModelFields.modelId, modelId)))
    .orderBy(contentModelFields.position);

  await validateSlugFields(db, tenantId, modelId, fields, data, excludeEntryId);
  validateUrlFields(fields, data);
  validateTimeFields(fields, data);

  for (const field of fields) {
    const value = data[field.key];

    if (field.required && isEmptyValue(value)) {
      throw new ApiError("VALIDATION_ERROR", `Required field is missing: ${field.key}`);
    }

    if (field.type === "component" && !isEmptyValue(value)) {
      const targets = await db.select({ targetModelId: contentModelFieldTargets.targetModelId }).from(contentModelFieldTargets).where(eq(contentModelFieldTargets.fieldId, field.id));
      await validateComponentValue(db, tenantId, targets.map((target) => target.targetModelId), field.isList, value);
    }
  }
}

function validateTimeFields(fields: ContentModelFieldRow[], data: Record<string, unknown>): void {
  for (const field of fields) {
    if (field.type === "time" && !isValidTimeValue(data[field.key])) {
      throw new ApiError("VALIDATION_ERROR", `Time field must use HH:mm (00:00–23:59): ${field.key}`);
    }
  }
}

async function validateSlugFields(
  db: EntryReadDb,
  tenantId: string,
  modelId: string,
  fields: ContentModelFieldRow[],
  data: Record<string, unknown>,
  excludeEntryId?: string,
): Promise<void> {
  const slugFields = fields.filter((field) => field.type === "slug");

  for (const field of slugFields) {
    const value = data[field.key];
    if (isEmptySlugValue(value)) continue;

    if (typeof value !== "string" || !slugPattern.test(value)) {
      throw new ApiError("VALIDATION_ERROR", `Slug field must use lowercase letters, numbers, hyphens, and underscores: ${field.key}`);
    }

    if (field.config.unique !== true) continue;

    const filters = [
      eq(contentEntries.tenantId, tenantId),
      eq(contentEntries.modelId, modelId),
      sql`${contentEntries.deletedAt} is null`,
      sql`${contentEntries.data}->>${field.key} = ${value}`,
    ];
    if (excludeEntryId) filters.push(ne(contentEntries.id, excludeEntryId));

    const [existingEntry] = await db
      .select({ id: contentEntries.id })
      .from(contentEntries)
      .where(and(...filters))
      .limit(1);

    if (existingEntry) {
      throw new ApiError("CONFLICT", `Slug is already used by another entry: ${field.key}`);
    }
  }
}

function validateUrlFields(fields: ContentModelFieldRow[], data: Record<string, unknown>): void {
  for (const field of fields) {
    if (field.type !== "url") continue;

    const value = data[field.key];
    if (isEmptySlugValue(value)) continue;

    if (typeof value !== "string" || !URL.canParse(value)) {
      throw new ApiError("VALIDATION_ERROR", `URL field must contain a valid absolute URL: ${field.key}`);
    }
  }
}

async function validateComponentValue(
  db: EntryReadDb,
  tenantId: string,
  targetModelIds: string[],
  isList: boolean,
  value: unknown,
): Promise<void> {
  if (!targetModelIds.length) {
    throw new ApiError("VALIDATION_ERROR", "Component field target models were not found");
  }

  const references = isList ? (Array.isArray(value) ? value : []) : [value];

  if (!isList && Array.isArray(value)) {
    throw new ApiError("VALIDATION_ERROR", "Single component fields cannot contain a list");
  }

  for (const reference of references) {
    if (!isChildReference(reference)) {
      throw new ApiError("VALIDATION_ERROR", "Component values must reference child entries");
    }

    const [child] = await db
      .select({ id: contentEntries.id })
      .from(contentEntries)
      .where(
        and(
          eq(contentEntries.tenantId, tenantId),
          eq(contentEntries.id, reference.childEntryId),
          inArray(contentEntries.modelId, targetModelIds),
          sql`${contentEntries.deletedAt} is null`,
        ),
      )
      .limit(1);

    if (!child) {
      throw new ApiError("VALIDATION_ERROR", "Component entry reference was not found");
    }
  }
}

function isChildReference(value: unknown): value is { childEntryId: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "childEntryId" in value &&
    typeof value.childEntryId === "string"
  );
}

function isEmptySlugValue(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function isEmptyValue(value: unknown): boolean {
  return isEmptyRichTextDocument(value) || (Array.isArray(value) && value.length === 0);
}
