"use server";

import { and, asc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { assets, contentEntries, contentModelFields, contentModels } from "@/db/schema";
import { requireTenantContext } from "@/lib/cms/context";
import { CmsError } from "@/lib/cms/errors";
import { type LinkDestination } from "@/lib/links";
import { richTextPlainText } from "@/lib/rich-text";
import { localizeEntryData } from "@/modules/localization/locales";
import { getTenantLocalization } from "@/modules/localization/tenant";
import { loadPageGraph } from "@/modules/entries/page-paths";
import { resolveEntryPagePath } from "@/lib/page-hierarchy";

const searchSchema = z.object({
  kind: z.enum(["page", "asset"]), query: z.string().trim().max(200).default(""),
  page: z.number().int().min(0).max(10000).default(0), id: z.uuid().optional(), locale: z.string().max(40).optional(),
});

export async function searchLinkDestinations(tenantSlug: string, input: z.input<typeof searchSchema>): Promise<{ items: LinkDestination[]; hasMore: boolean }> {
  const context = await requireTenantContext(crypto.randomUUID(), tenantSlug);
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) throw new CmsError("BAD_REQUEST", "Invalid link search");
  const { kind, query, page, id } = parsed.data;
  const tenantId = context.activeTenantId;
  const limit = 30;
  if (kind === "asset") {
    const rows = await db.select().from(assets).where(and(
      eq(assets.tenantId, tenantId), eq(assets.status, "ready"), isNull(assets.deletedAt),
      id ? eq(assets.id, id) : query ? ilike(assets.originalName, `%${query}%`) : undefined,
    )).orderBy(asc(assets.originalName), asc(assets.id)).limit(limit + 1).offset(page * limit);
    return { hasMore: rows.length > limit, items: rows.slice(0, limit).map((asset) => ({
      id: asset.id, kind, title: asset.originalName, status: "ready", href: null,
      detail: `${asset.mimeType} · ${asset.sizeBytes >= 1048576 ? (asset.sizeBytes / 1048576).toFixed(1) + " MB" : Math.ceil(asset.sizeBytes / 1024) + " KB"}`,
    })) };
  }
  const localization = await getTenantLocalization(db, tenantId);
  const locale = parsed.data.locale ?? localization.defaultLocale;
  if (!localization.locales.includes(locale)) throw new CmsError("BAD_REQUEST", "Unknown language");
  const rows = await db.select({ entry: contentEntries, model: contentModels }).from(contentEntries)
    .innerJoin(contentModels, eq(contentModels.id, contentEntries.modelId))
    .where(and(eq(contentEntries.tenantId, tenantId), isNull(contentEntries.deletedAt), isNull(contentEntries.parentEntryId),
      sql`${contentModels.pageUrl} is not null`, id ? eq(contentEntries.id, id) : eq(contentModels.status, "active"),
      !id && query ? or(ilike(contentModels.name, `%${query}%`), sql`${contentEntries.data}::text ilike ${`%${query}%`}`, sql`${contentEntries.translations}::text ilike ${`%${query}%`}`) : undefined,
    )).orderBy(asc(contentModels.name), asc(contentEntries.id)).limit(limit + 1).offset(page * limit);
  const fields = await db.select().from(contentModelFields).where(eq(contentModelFields.tenantId, tenantId));
  const graph = await loadPageGraph(db, tenantId);
  return { hasMore: rows.length > limit, items: rows.slice(0, limit).map(({ entry, model }) => {
    const modelFields = fields.filter((field) => field.modelId === model.id);
    const data = localizeEntryData(modelFields, entry.data, entry.translations, locale, localization);
    const titleField = modelFields.find((field) => field.isTitle);
    const href = resolveEntryPagePath(graph, entry.id, locale);
    return { id: entry.id, kind, title: (titleField ? richTextPlainText(data[titleField.key]) : "") || "Untitled page", status: entry.status, href, detail: `${model.name} · ${href ?? "Missing slug"}` };
  }) };
}
