import "server-only";

import { and, desc, eq, getTableColumns, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { assets, contentEntries, contentModelFields, contentModelFieldTargets, contentModels } from "@/db/schema";
import { CmsError } from "@/lib/cms/errors";
import { presignRead } from "@/lib/storage/s3";

type EntryRow = typeof contentEntries.$inferSelect;
type FieldRow = typeof contentModelFields.$inferSelect & { targetModelIds: string[] };
const maxComponentReferences = 500;
const maxResolvedAssets = 200;
const maxRichTextNodes = 2_000;
const maxRichTextDepth = 100;

export async function listDeliveryModels(tenantId: string) {
  const rows = await db
    .select()
    .from(contentModels)
    .where(eq(contentModels.tenantId, tenantId))
    .orderBy(contentModels.name)
    .limit(100);

  return rows.map(serializeModel);
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
}) {
  const model = await getModelBySlug(input.tenantId, input.modelSlug);
  const cursor = input.cursor ? decodeCursor(input.cursor) : null;
  const filters = [
    eq(contentEntries.tenantId, input.tenantId),
    eq(contentEntries.modelId, model.id),
    eq(contentEntries.status, "published"),
    isNull(contentEntries.deletedAt),
    isNull(contentEntries.parentEntryId),
  ];
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
  const resolver = createEntryResolver(input.tenantId, input.maxDepth);

  return {
    entries: await Promise.all(pageRows.map((entry) => resolver.resolve(entry, 1, new Set()))),
    nextCursor: hasNextPage && pageRows.length ? encodeCursor(pageRows[pageRows.length - 1]!.cursorCreatedAt, pageRows[pageRows.length - 1]!.id) : null,
  };
}

export async function getPublishedEntry(input: {
  tenantId: string;
  modelSlug: string;
  entryId: string;
  maxDepth: number;
}) {
  const model = await getModelBySlug(input.tenantId, input.modelSlug);
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

  return createEntryResolver(input.tenantId, input.maxDepth).resolve(entry, 1, new Set());
}

export function parseDeliveryQuery(url: string, includePagination: boolean) {
  const searchParams = new URL(url).searchParams;
  const maxDepth = parseBoundedInteger(searchParams.get("maxDepth"), 1, 1, 5, "maxDepth");
  const limit = includePagination ? parseBoundedInteger(searchParams.get("limit"), 20, 1, 100, "limit") : 1;

  return { maxDepth, limit, cursor: includePagination ? searchParams.get("cursor") : null };
}

function createEntryResolver(tenantId: string, maxDepth: number) {
  const fieldsByModel = new Map<string, Promise<FieldRow[]>>();
  const entriesById = new Map<string, Promise<EntryRow | null>>();
  const assetsById = new Map<string, Promise<unknown>>();
  let componentReferenceCount = 0;
  let resolvedAssetCount = 0;
  let richTextNodeCount = 0;

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
        .then(async ([asset]) => {
          if (!asset) return null;
          return {
            id: asset.id,
            originalName: asset.originalName,
            mimeType: asset.mimeType,
            sizeBytes: asset.sizeBytes,
            imageWidth: asset.imageWidth,
            imageHeight: asset.imageHeight,
            url: await presignRead({ bucket: asset.bucket, objectKey: asset.objectKey, expiresIn: 300 }),
          };
        });
      assetsById.set(assetId, result);
    }
    return result;
  }

  async function resolve(entry: EntryRow, depth: number, ancestors: Set<string>): Promise<Record<string, unknown>> {
    const entryFields = await fields(entry.modelId);
    const fieldByKey = new Map(entryFields.map((field) => [field.key, field]));
    const nextAncestors = new Set(ancestors).add(entry.id);
    const resolvedData = Object.fromEntries(
      await Promise.all(
        Object.entries(entry.data).map(async ([key, value]) => {
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

  async function resolveRichTextAssets(value: unknown, depth = 0): Promise<unknown> {
    richTextNodeCount += 1;
    if (richTextNodeCount > maxRichTextNodes || depth > maxRichTextDepth) {
      throw new CmsError("BAD_REQUEST", "Rich-text content is too deeply nested or complex to expand");
    }
    if (Array.isArray(value)) return Promise.all(value.map((item) => resolveRichTextAssets(item, depth + 1)));
    if (typeof value !== "object" || value === null) return value;

    const record = value as Record<string, unknown>;
    if (record.type === "asset" && typeof record.attrs === "object" && record.attrs !== null) {
      const attrs = record.attrs as Record<string, unknown>;
      if (typeof attrs.assetId === "string") {
        return { ...record, attrs: { ...attrs, asset: await deliveryAsset(attrs.assetId) } };
      }
    }

    return Object.fromEntries(
      await Promise.all(Object.entries(record).map(async ([key, nestedValue]) => [key, await resolveRichTextAssets(nestedValue, depth + 1)] as const)),
    );
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
