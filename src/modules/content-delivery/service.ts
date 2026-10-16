import "server-only";

import { and, desc, eq, getTableColumns, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { assets, contentEntries, contentModelFields, contentModelFieldTargets, contentModels } from "@/db/schema";
import { CmsError } from "@/lib/cms/errors";
import { resolvePagePath } from "@/lib/links";
import { assetDownloadUrl } from "@/modules/uploads/download";
import { presignRead } from "@/lib/storage/s3";
import { canonicalLocale, isLocalizedField, localizeEntryData, type TenantLocalization } from "@/modules/localization/locales";
import { getTenantLocalization } from "@/modules/localization/tenant";
import { createRichTextAssetResolver } from "./rich-text";

type EntryRow = typeof contentEntries.$inferSelect;
type FieldRow = typeof contentModelFields.$inferSelect & { targetModelIds: string[] };
const maxComponentReferences = 500;
const maxResolvedAssets = 200;

export async function listDeliveryModels(tenantId: string) {
  const [rows, localization] = await Promise.all([
    db
      .select()
      .from(contentModels)
      .where(eq(contentModels.tenantId, tenantId))
      .orderBy(contentModels.name)
      .limit(100),
    getTenantLocalization(db, tenantId),
  ]);

  return { models: rows.map(serializeModel), localization };
}

export async function getDeliveryModel(tenantId: string, modelSlug: string) {
  const model = await getModelBySlug(tenantId, modelSlug);
  const fields = await getModelFields(tenantId, model.id);

  return {
    ...serializeModel(model),
    fields: fields.map((field) => ({
      id: field.id,
      key: field.key,
      label: field.label,
      type: field.type,
      required: field.required,
      position: field.position,
      config: field.config,
      isList: field.isList,
      isTitle: field.isTitle,
      localized: field.localized,
      targetModelIds: field.targetModelIds,
    })),
  };
}

export async function listPublishedEntries(input: {
  tenantId: string;
  modelSlug: string;
  limit: number;
  cursor: string | null;
  maxDepth: number;
  locale: string | null;
  slug?: string | null;
  slugField?: string | null;
}) {
  const [model, locale] = await Promise.all([getModelBySlug(input.tenantId, input.modelSlug), resolveDeliveryLocale(input.tenantId, input.locale)]);
  const cursor = input.cursor ? decodeCursor(input.cursor) : null;
  const filters = [
    eq(contentEntries.tenantId, input.tenantId),
    eq(contentEntries.modelId, model.id),
    eq(contentEntries.status, "published"),
    isNull(contentEntries.deletedAt),
    isNull(contentEntries.parentEntryId),
  ];
  if (input.slug !== null && input.slug !== undefined) {
    const field = slugFilterField(await getModelFields(input.tenantId, model.id), input.slugField ?? null);
    filters.push(sql`${slugValueSql(field, locale)} = ${input.slug}`);
  }
  if (cursor) {
    filters.push(sql`(${contentEntries.createdAt}, ${contentEntries.id}) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`);
  }
  const rows = await db
    .select({
      ...getTableColumns(contentEntries),
      cursorCreatedAt: sql<string>`to_char(${contentEntries.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
    })
    .from(contentEntries)
    .where(and(...filters))
    .orderBy(desc(contentEntries.createdAt), desc(contentEntries.id))
    .limit(input.limit + 1);
  const hasNextPage = rows.length > input.limit;
  const pageRows = rows.slice(0, input.limit);
  const resolver = createEntryResolver(input.tenantId, input.maxDepth, locale);

  return {
    locale: locale.locale,
    entries: await Promise.all(pageRows.map((entry) => resolver.resolve(entry, 1, new Set()))),
    nextCursor: hasNextPage && pageRows.length ? encodeCursor(pageRows[pageRows.length - 1]!.cursorCreatedAt, pageRows[pageRows.length - 1]!.id) : null,
  };
}

export async function getPublishedEntry(input: {
  tenantId: string;
  modelSlug: string;
  entryId: string;
  maxDepth: number;
  locale: string | null;
}) {
  const [model, locale] = await Promise.all([getModelBySlug(input.tenantId, input.modelSlug), resolveDeliveryLocale(input.tenantId, input.locale)]);
  const entryId = z.uuid().safeParse(input.entryId);
  if (!entryId.success) throw new CmsError("BAD_REQUEST", "entryId must be a UUID");
  const [entry] = await db
    .select()
    .from(contentEntries)
    .where(
      and(
        eq(contentEntries.tenantId, input.tenantId),
        eq(contentEntries.modelId, model.id),
        eq(contentEntries.id, entryId.data),
        eq(contentEntries.status, "published"),
        isNull(contentEntries.deletedAt),
      ),
    )
    .limit(1);
  if (!entry) throw new CmsError("NOT_FOUND", "Published entry was not found");

  return {
    locale: locale.locale,
    entry: await createEntryResolver(input.tenantId, input.maxDepth, locale).resolve(entry, 1, new Set()),
  };
}

/** A ready asset by ID with a fresh read URL, so integrations can store asset IDs instead of expiring URLs. */
export async function getDeliveryAsset(tenantId: string, assetId: string) {
  const id = z.uuid().safeParse(assetId);
  if (!id.success) throw new CmsError("BAD_REQUEST", "assetId must be a UUID");
  const [asset] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.tenantId, tenantId), eq(assets.id, id.data), eq(assets.status, "ready"), isNull(assets.deletedAt)))
    .limit(1);
  if (!asset) throw new CmsError("NOT_FOUND", "Asset was not found");
  return serializeDeliveryAsset(asset);
}

async function serializeDeliveryAsset(asset: typeof assets.$inferSelect) {
  return {
    id: asset.id,
    originalName: asset.originalName,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    imageWidth: asset.imageWidth,
    imageHeight: asset.imageHeight,
    downloadUrl: assetDownloadUrl(asset.tenantId, asset.id),
    url: await presignRead({ bucket: asset.bucket, objectKey: asset.objectKey, expiresIn: 300 }),
  };
}

export function parseDeliveryQuery(url: string, includePagination: boolean) {
  const searchParams = new URL(url).searchParams;
  const maxDepth = parseBoundedInteger(searchParams.get("maxDepth"), 1, 1, 5, "maxDepth");
  const limit = includePagination ? parseBoundedInteger(searchParams.get("limit"), 20, 1, 100, "limit") : 1;
  const slug = includePagination ? searchParams.get("slug") : null;
  const slugField = includePagination ? searchParams.get("slugField") : null;
  if (slug !== null && (!slug || slug.length > 200)) throw new CmsError("BAD_REQUEST", "slug must contain 1 to 200 characters");
  if (slugField !== null && slug === null) throw new CmsError("BAD_REQUEST", "slugField can only be used together with slug");

  return { maxDepth, limit, cursor: includePagination ? searchParams.get("cursor") : null, locale: searchParams.get("locale"), slug, slugField };
}

/** The slug field to filter on: the one named by slugField, or the model's only slug field. */
function slugFilterField(fields: FieldRow[], slugField: string | null): FieldRow {
  const slugFields = fields.filter((field) => field.type === "slug");
  if (slugField !== null) {
    const field = slugFields.find((item) => item.key === slugField);
    if (!field) throw new CmsError("BAD_REQUEST", `slugField must be a slug field of this model${slugFields.length ? `: ${slugFields.map((item) => item.key).join(", ")}` : ""}`);
    return field;
  }
  if (slugFields.length === 1) return slugFields[0]!;
  if (!slugFields.length) throw new CmsError("BAD_REQUEST", "This model has no slug field to filter on");
  throw new CmsError("BAD_REQUEST", `This model has several slug fields; pass slugField: ${slugFields.map((item) => item.key).join(", ")}`);
}

/** The slug an entry shows in the locale: its translation for translatable fields, falling back to the default value. */
function slugValueSql(field: FieldRow, { locale, localization }: DeliveryLocale) {
  if (!isLocalizedField(field) || locale === localization.defaultLocale) return sql`${contentEntries.data}->>${field.key}`;
  return sql`coalesce(nullif(${contentEntries.translations}->${locale}->>${field.key}, ''), ${contentEntries.data}->>${field.key})`;
}

type DeliveryLocale = { locale: string; localization: TenantLocalization };

/** The requested locale, or the tenant's default when none is given. Unknown locales are rejected instead of silently falling back. */
async function resolveDeliveryLocale(tenantId: string, requested: string | null): Promise<DeliveryLocale> {
  const localization = await getTenantLocalization(db, tenantId);
  if (!requested) return { locale: localization.defaultLocale, localization };

  const locale = canonicalLocale(requested);
  if (!locale || !localization.locales.includes(locale)) {
    throw new CmsError("BAD_REQUEST", `locale must be one of: ${localization.locales.join(", ")}`);
  }
  return { locale, localization };
}

function createEntryResolver(tenantId: string, maxDepth: number, { locale, localization }: DeliveryLocale) {
  const fieldsByModel = new Map<string, Promise<FieldRow[]>>();
  const entriesById = new Map<string, Promise<EntryRow | null>>();
  const assetsById = new Map<string, Promise<unknown>>();
  let componentReferenceCount = 0;
  let resolvedAssetCount = 0;
  const modelsById = new Map<string, Promise<typeof contentModels.$inferSelect | null>>();
  const pagesById = new Map<string, Promise<{ href: string } | null>>();
  const resolveRichTextAssets = createRichTextAssetResolver(deliveryAsset, deliveryPage);

  function model(id: string) {
    let result = modelsById.get(id);
    if (!result) {
      result = db.select().from(contentModels).where(and(eq(contentModels.tenantId, tenantId), eq(contentModels.id, id))).limit(1).then((rows) => rows[0] ?? null);
      modelsById.set(id, result);
    }
    return result;
  }

  async function deliveryPage(id: string): Promise<{ href: string } | null> {
    if (!z.uuid().safeParse(id).success) return null;
    let result = pagesById.get(id);
    if (!result) {
      if (pagesById.size >= 200) throw new CmsError("BAD_REQUEST", "Expanded content cannot exceed 200 linked pages");
      result = (async () => {
        const entry = await publishedEntry(id);
        if (!entry || entry.parentEntryId) return null;
        const target = await model(entry.modelId);
        const data = localizeEntryData(await fields(entry.modelId), entry.data, entry.translations, locale, localization);
        const href = resolvePagePath(target?.pageUrl, data, locale);
        return href ? { href } : null;
      })();
      pagesById.set(id, result);
    }
    return result;
  }

  async function fields(modelId: string) {
    let result = fieldsByModel.get(modelId);
    if (!result) {
      result = getModelFields(tenantId, modelId);
      fieldsByModel.set(modelId, result);
    }
    return result;
  }

  async function publishedEntry(entryId: string) {
    let result = entriesById.get(entryId);
    if (!result) {
      result = db
        .select()
        .from(contentEntries)
        .where(
          and(
            eq(contentEntries.tenantId, tenantId),
            eq(contentEntries.id, entryId),
            eq(contentEntries.status, "published"),
            isNull(contentEntries.deletedAt),
          ),
        )
        .limit(1)
        .then((rows) => rows[0] ?? null);
      entriesById.set(entryId, result);
    }
    return result;
  }

  async function deliveryAsset(assetId: string) {
    if (!z.uuid().safeParse(assetId).success) return null;
    let result = assetsById.get(assetId);
    if (!result) {
      resolvedAssetCount += 1;
      if (resolvedAssetCount > maxResolvedAssets) {
        throw new CmsError("BAD_REQUEST", `Expanded content cannot exceed ${maxResolvedAssets} unique assets`);
      }
      result = db
        .select()
        .from(assets)
        .where(and(eq(assets.tenantId, tenantId), eq(assets.id, assetId), eq(assets.status, "ready"), isNull(assets.deletedAt)))
        .limit(1)
        .then(([asset]) => (asset ? serializeDeliveryAsset(asset) : null));
      assetsById.set(assetId, result);
    }
    return result;
  }

  async function resolve(entry: EntryRow, depth: number, ancestors: Set<string>): Promise<Record<string, unknown>> {
    const entryFields = await fields(entry.modelId);
    const fieldByKey = new Map(entryFields.map((field) => [field.key, field]));
    const nextAncestors = new Set(ancestors).add(entry.id);
    const data = localizeEntryData(entryFields, entry.data, entry.translations, locale, localization);
    const resolvedData = Object.fromEntries(
      await Promise.all(
        Object.entries(data).map(async ([key, value]) => {
          const field = fieldByKey.get(key);
          if (field?.type === "asset") {
            return [key, typeof value === "string" ? await deliveryAsset(value) : null] as const;
          }
          if (field?.type === "rich_text") {
            return [key, await resolveRichTextAssets(value)] as const;
          }
          if (field?.type === "component") {
            return [key, await resolveComponentValue(field, value, depth, nextAncestors)] as const;
          }
          return [key, value] as const;
        }),
      ),
    );

    return {
      id: entry.id,
      modelId: entry.modelId,
      url: entry.parentEntryId ? null : resolvePagePath((await model(entry.modelId))?.pageUrl, data, locale),
      status: entry.status,
      data: resolvedData,
      publishedAt: entry.publishedAt?.toISOString() ?? null,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    };
  }

  async function resolveComponentValue(field: FieldRow, value: unknown, depth: number, ancestors: Set<string>) {
    const ids = componentReferenceIds(field.isList, value);
    const resolved = await Promise.all(
      ids.map(async (id) => {
        componentReferenceCount += 1;
        if (componentReferenceCount > maxComponentReferences) {
          throw new CmsError("BAD_REQUEST", `Expanded content cannot exceed ${maxComponentReferences} component references`);
        }
        const entry = await publishedEntry(id);
        if (!entry || !field.targetModelIds.includes(entry.modelId)) return null;
        if (depth >= maxDepth || ancestors.has(id)) return { id: entry.id, modelId: entry.modelId };
        return resolve(entry, depth + 1, ancestors);
      }),
    );
    const available = resolved.filter((item) => item !== null);
    return field.isList ? available : (available[0] ?? null);
  }

  return { resolve };
}

async function getModelBySlug(tenantId: string, modelSlug: string) {
  const [model] = await db
    .select()
    .from(contentModels)
    .where(and(eq(contentModels.tenantId, tenantId), eq(contentModels.slug, modelSlug)))
    .limit(1);
  if (!model) throw new CmsError("NOT_FOUND", "Content model was not found");
  return model;
}

async function getModelFields(tenantId: string, modelId: string): Promise<FieldRow[]> {
  const fields = await db
    .select()
    .from(contentModelFields)
    .where(and(eq(contentModelFields.tenantId, tenantId), eq(contentModelFields.modelId, modelId)))
    .orderBy(contentModelFields.position);
  const targets = fields.length
    ? await db
        .select({ fieldId: contentModelFieldTargets.fieldId, targetModelId: contentModelFieldTargets.targetModelId })
        .from(contentModelFieldTargets)
        .where(inArray(contentModelFieldTargets.fieldId, fields.map((field) => field.id)))
    : [];

  return fields.map((field) => ({
    ...field,
    targetModelIds: targets.filter((target) => target.fieldId === field.id).map((target) => target.targetModelId),
  }));
}

function componentReferenceIds(isList: boolean, value: unknown): string[] {
  const values = isList && Array.isArray(value) ? value : [value];
  return values.flatMap((reference) => {
    if (typeof reference === "string") return [reference];
    if (typeof reference === "object" && reference !== null && "childEntryId" in reference && typeof reference.childEntryId === "string") {
      return [reference.childEntryId];
    }
    return [];
  });
}

function serializeModel(model: typeof contentModels.$inferSelect) {
  return {
    id: model.id,
    name: model.name,
    slug: model.slug,
    pageUrl: model.pageUrl,
    status: model.status,
    createdAt: model.createdAt.toISOString(),
    updatedAt: model.updatedAt.toISOString(),
  };
}

function parseBoundedInteger(value: string | null, fallback: number, min: number, max: number, name: string): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new CmsError("BAD_REQUEST", `${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt, id })).toString("base64url");
}

function decodeCursor(value: string): { createdAt: string; id: string } {
  try {
    return z
      .object({
        createdAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/),
        id: z.uuid(),
      })
      .parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  } catch {
    throw new CmsError("BAD_REQUEST", "cursor is invalid");
  }
}
