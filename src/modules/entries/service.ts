import { and, eq, inArray, max, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { type Db } from "@/db";
import { assets, contentEntries, contentModelFields, contentModelFieldTargets, contentModels, entryRevisions, type EntryTranslations } from "@/db/schema";
import { CmsError as ApiError } from "@/lib/cms/errors";
import { isEmptyRichTextDocument } from "@/lib/rich-text";
import { isLocalizedField, sanitizeTranslations, type TenantLocalization } from "@/modules/localization/locales";
import { getTenantLocalization } from "@/modules/localization/tenant";
import { allowedAssetTypes, describeAllowedAssetTypes, isAssetTypeAllowed } from "@/modules/uploads/asset-types";
import { validatePagePaths, validateRichTextLinks } from "./links";
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
    translations?: EntryTranslations;
    userId: string;
  },
): Promise<void> {
  const [versionRow] = await tx
    .select({ value: max(entryRevisions.version) })
    .from(entryRevisions)
    .where(and(eq(entryRevisions.tenantId, input.tenantId), eq(entryRevisions.entryId, input.entryId)));

  const [entry] = await tx.select({ pageParentId: contentEntries.pageParentId }).from(contentEntries).where(and(eq(contentEntries.tenantId, input.tenantId), eq(contentEntries.id, input.entryId)));
  await tx.insert(entryRevisions).values({
    pageParentId: entry?.pageParentId ?? null,
    tenantId: input.tenantId,
    entryId: input.entryId,
    version: (versionRow?.value ?? 0) + 1,
    data: input.data,
    translations: input.translations ?? {},
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
  translations: EntryTranslations = {},
): Promise<void> {
  const fields = await getModelFields(db, tenantId, modelId);
  await validateFieldFormats(db, tenantId, modelId, fields, data, translations, excludeEntryId);
  await validateRichTextLinks(db, tenantId, fields, data, translations, false, excludeEntryId);
}

/** Drops translations for languages the tenant does not use and for fields that are not translatable. */
export async function sanitizeEntryTranslations(db: EntryReadDb, tenantId: string, modelId: string, translations: unknown): Promise<EntryTranslations> {
  const [fields, localization] = await Promise.all([getModelFields(db, tenantId, modelId), getTenantLocalization(db, tenantId)]);
  return sanitizeTranslations(fields, translations, localization);
}

export async function validateEntryForPublish(db: EntryReadDb, tenantId: string, entryId: string): Promise<void> {
  const entry = await getTenantEntry(db, tenantId, entryId);
  if (!entry) {
    throw new ApiError("NOT_FOUND", "Entry was not found");
  }

  await validateEntryDataForPublish(db, tenantId, entry.modelId, entry.data, entry.id, entry.translations);
}

export async function validateEntryDataForPublish(
  db: EntryReadDb,
  tenantId: string,
  modelId: string,
  data: Record<string, unknown>,
  excludeEntryId?: string,
  translations: EntryTranslations = {},
): Promise<void> {
  const fields = await getModelFields(db, tenantId, modelId);
  await validateFieldFormats(db, tenantId, modelId, fields, data, translations, excludeEntryId);
  await validateRichTextLinks(db, tenantId, fields, data, translations, true, excludeEntryId);
  const current = excludeEntryId ? await getTenantEntry(db, tenantId, excludeEntryId) : null;
  if (!current?.parentEntryId) await validatePagePaths(db, tenantId, { modelId, entry: { id: excludeEntryId, data, translations } });

  // Translations are optional: a required field only needs a value in the default language.
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

function getModelFields(db: EntryReadDb, tenantId: string, modelId: string) {
  return db
    .select()
    .from(contentModelFields)
    .where(and(eq(contentModelFields.tenantId, tenantId), eq(contentModelFields.modelId, modelId)))
    .orderBy(contentModelFields.position);
}

async function validateFieldFormats(
  db: EntryReadDb,
  tenantId: string,
  modelId: string,
  fields: ContentModelFieldRow[],
  data: Record<string, unknown>,
  translations: EntryTranslations,
  excludeEntryId?: string,
): Promise<void> {
  const localization = await getTenantLocalization(db, tenantId);
  const localizedFields = fields.filter(isLocalizedField);

  validateUrlFields(fields, data);
  validateTimeFields(fields, data);
  for (const [locale, values] of Object.entries(translations)) {
    validateUrlFields(localizedFields, values, locale);
    validateSlugFormats(localizedFields, values, locale);
  }
  await validateSlugFields(db, tenantId, modelId, fields, data, translations, localization, excludeEntryId);
  await validateAssetTypes(db, tenantId, fields, data, translations);
}

async function validateAssetTypes(
  db: EntryReadDb,
  tenantId: string,
  fields: ContentModelFieldRow[],
  data: Record<string, unknown>,
  translations: EntryTranslations,
): Promise<void> {
  const selections = fields.flatMap((field) => {
    const allowed = allowedAssetTypes(field.config);
    if (field.type !== "asset" || !allowed.length) return [];
    const values = [{ locale: undefined as string | undefined, value: data[field.key] }];
    if (isLocalizedField(field)) values.push(...Object.entries(translations).map(([locale, localeValues]) => ({ locale, value: localeValues[field.key] })));
    return values.flatMap(({ locale, value }) => (typeof value === "string" && z.uuid().safeParse(value).success ? [{ field, allowed, locale, assetId: value }] : []));
  });
  if (!selections.length) return;

  const selectedAssets = await db
    .select({ id: assets.id, mimeType: assets.mimeType, originalName: assets.originalName })
    .from(assets)
    .where(and(eq(assets.tenantId, tenantId), inArray(assets.id, [...new Set(selections.map((selection) => selection.assetId))])));
  const assetsById = new Map(selectedAssets.map((asset) => [asset.id, asset]));

  for (const { field, allowed, locale, assetId } of selections) {
    const asset = assetsById.get(assetId);
    if (asset && !isAssetTypeAllowed(allowed, { mimeType: asset.mimeType, name: asset.originalName })) {
      throw new ApiError("VALIDATION_ERROR", `${asset.originalName} is not allowed in ${fieldName(field, locale)}. Allowed: ${describeAllowedAssetTypes(allowed)}`);
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

function validateSlugFormats(fields: ContentModelFieldRow[], data: Record<string, unknown>, locale?: string): void {
  for (const field of fields) {
    if (field.type !== "slug") continue;

    const value = data[field.key];
    if (isEmptySlugValue(value)) continue;

    if (typeof value !== "string" || !slugPattern.test(value)) {
      throw new ApiError("VALIDATION_ERROR", `Slug field must use lowercase letters, numbers, hyphens, and underscores: ${fieldName(field, locale)}`);
    }
  }
}

async function validateSlugFields(
  db: EntryReadDb,
  tenantId: string,
  modelId: string,
  fields: ContentModelFieldRow[],
  data: Record<string, unknown>,
  translations: EntryTranslations,
  localization: TenantLocalization,
  excludeEntryId?: string,
): Promise<void> {
  validateSlugFormats(fields, data);
  const [model] = await db.select({ pageUrl: contentModels.pageUrl }).from(contentModels).where(and(eq(contentModels.tenantId, tenantId), eq(contentModels.id, modelId))).limit(1);

  for (const field of fields) {
    if (field.type !== "slug" || field.config.unique !== true) continue;
    // The page-tree validator enforces sibling uniqueness for the routing slug.
    if (model?.pageUrl?.hierarchy && model.pageUrl.slugField === field.key) continue;

    // A translated slug must be unique among the values entries show in that language, including fallbacks to the default.
    const locales = isLocalizedField(field) ? localization.locales : [localization.defaultLocale];
    for (const locale of locales) {
      const isDefault = locale === localization.defaultLocale;
      const translated = isDefault ? undefined : translations[locale]?.[field.key];
      const value = isEmptySlugValue(translated) ? data[field.key] : translated;
      if (isEmptySlugValue(value)) continue;

      const storedValue = isDefault
        ? sql`${contentEntries.data}->>${field.key}`
        : sql`coalesce(nullif(${contentEntries.translations}->${locale}->>${field.key}, ''), ${contentEntries.data}->>${field.key})`;
      const filters = [
        eq(contentEntries.tenantId, tenantId),
        eq(contentEntries.modelId, modelId),
        sql`${contentEntries.deletedAt} is null`,
        sql`${storedValue} = ${value}`,
      ];
      if (excludeEntryId) filters.push(ne(contentEntries.id, excludeEntryId));

      const [existingEntry] = await db
        .select({ id: contentEntries.id })
        .from(contentEntries)
        .where(and(...filters))
        .limit(1);

      if (existingEntry) {
        throw new ApiError("CONFLICT", `Slug is already used by another entry: ${fieldName(field, isDefault || locales.length === 1 ? undefined : locale)}`);
      }
    }
  }
}

function validateUrlFields(fields: ContentModelFieldRow[], data: Record<string, unknown>, locale?: string): void {
  for (const field of fields) {
    if (field.type !== "url") continue;

    const value = data[field.key];
    if (isEmptySlugValue(value)) continue;

    if (typeof value !== "string" || !URL.canParse(value)) {
      throw new ApiError("VALIDATION_ERROR", `URL field must contain a valid absolute URL: ${fieldName(field, locale)}`);
    }
  }
}

function fieldName(field: ContentModelFieldRow, locale?: string): string {
  return locale ? `${field.key} (${locale})` : field.key;
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
