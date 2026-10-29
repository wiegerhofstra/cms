import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import type { Db } from "@/db";
import { assets, contentEntries, contentModelFields, contentModels } from "@/db/schema";
import { CmsError } from "@/lib/cms/errors";
import { richTextLinks, safeLinkHref, type PageUrlConfig } from "@/lib/links";
import { localizeEntryData, type EntryTranslations } from "@/modules/localization/locales";
import { getTenantLocalization } from "@/modules/localization/tenant";
import { resolveEntryPagePath } from "@/lib/page-hierarchy";
import { loadPageGraph, validatePageGraph } from "./page-paths";

type ReadDb = Pick<Db, "select">;
type Field = typeof contentModelFields.$inferSelect;

export async function validateRichTextLinks(db: ReadDb, tenantId: string, fields: Field[], data: Record<string, unknown>, translations: EntryTranslations, publishing: boolean, selfId?: string) {
  const localization = await getTenantLocalization(db, tenantId);
  const graph = publishing ? await loadPageGraph(db, tenantId) : null;
  if (graph && selfId) {
    const self = graph.entries.get(selfId);
    if (self) graph.entries.set(selfId, { ...self, data, translations, status: "published" });
  }
  for (const locale of localization.locales) {
    const checked = new Set<string>();
    const localized = localizeEntryData(fields, data, translations, locale, localization);
    for (const field of fields.filter((field) => field.type === "rich_text")) {
      let links: Record<string, unknown>[];
      try { links = richTextLinks(localized[field.key]); }
      catch { throw new CmsError("VALIDATION_ERROR", `Rich text is too complex: ${field.label}`); }
      for (const link of links) {
        const suffix = `in ${field.label} (${locale})`;
        if (!link.kind || link.kind === "url") {
          if (!safeLinkHref(link.href)) throw new CmsError("VALIDATION_ERROR", `Invalid link URL ${suffix}`);
          continue;
        }
        const id = link.kind === "asset" ? link.assetId : link.entryId;
        if (!["asset", "page"].includes(String(link.kind)) || !z.uuid().safeParse(id).success) {
          throw new CmsError("VALIDATION_ERROR", `Invalid link destination ${suffix}`);
        }
        // Drafts may retain unavailable references for editors to repair; publication checks availability.
        if (!publishing) continue;
        const referenceKey = `${locale}:${link.kind}:${id}`;
        if (checked.has(referenceKey)) continue;
        checked.add(referenceKey);
        if (checked.size > 200) throw new CmsError("VALIDATION_ERROR", "Content cannot contain more than 200 distinct link destinations per language");
        if (link.kind === "asset") {
          const [asset] = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.tenantId, tenantId), eq(assets.id, id as string), eq(assets.status, "ready"), isNull(assets.deletedAt))).limit(1);
          if (!asset) throw new CmsError("VALIDATION_ERROR", `An asset link is unavailable ${suffix}. Choose another file or remove the link.`);
        } else {
          const [target] = await db.select({ entry: contentEntries, model: contentModels }).from(contentEntries)
            .innerJoin(contentModels, eq(contentModels.id, contentEntries.modelId))
            .where(and(eq(contentEntries.tenantId, tenantId), eq(contentEntries.id, id as string), isNull(contentEntries.deletedAt), isNull(contentEntries.parentEntryId))).limit(1);
          if (!target?.model.pageUrl) throw new CmsError("VALIDATION_ERROR", `A page link is unavailable ${suffix}. Choose another page or remove the link.`);
          if (target.entry.status !== "published" && target.entry.id !== selfId) throw new CmsError("VALIDATION_ERROR", `A linked page is still a draft ${suffix}. Publish that page first.`);
          if (!graph || !resolveEntryPagePath(graph, target.entry.id, locale, true)) {
            throw new CmsError("VALIDATION_ERROR", `A linked page has no slug ${suffix}`);
          }
        }
      }
    }
  }
}

/** Validate the entire affected tree, including descendants and draft sibling names. */
export async function validatePagePaths(db: ReadDb, tenantId: string, override?: {
  modelId: string; pageUrl?: PageUrlConfig | null;
  entry?: { id?: string; data: Record<string, unknown>; translations: EntryTranslations; pageParentId?: string | null };
}) {
  const graph = await loadPageGraph(db, tenantId);
  if (override?.pageUrl !== undefined) {
    const model = graph.models.get(override.modelId);
    if (model) graph.models.set(model.id, { ...model, pageUrl: override.pageUrl });
  }
  if (override?.entry) {
    const id = override.entry.id ?? "new";
    graph.entries.set(id, {
      id, modelId: override.modelId, parentEntryId: null, pageParentId: null,
      ...graph.entries.get(id), ...override.entry, status: "published",
    });
  }
  await validatePageGraph(db, tenantId, graph);
}

export async function validatePageUrlConfig(db: ReadDb, tenantId: string, modelId: string, pageUrl: PageUrlConfig | null) {
  if (pageUrl?.pattern.includes("{slug}")) {
    const [field] = await db.select().from(contentModelFields).where(and(eq(contentModelFields.tenantId, tenantId), eq(contentModelFields.modelId, modelId), eq(contentModelFields.key, pageUrl.slugField!))).limit(1);
    if (!field || field.type !== "slug" || !field.required || (!pageUrl.hierarchy && field.config.unique !== true)) {
      throw new CmsError("VALIDATION_ERROR", pageUrl.hierarchy ? "Choose a Required slug field. Slugs will be unique among sibling pages." : "Choose a slug field with Required and Unique value enabled.");
    }
  }
  await validatePagePaths(db, tenantId, { modelId, pageUrl });
}

// Serialize path changes with publication so concurrent publishers cannot claim the same path.
export async function lockPagePaths(tx: Pick<Db, "execute">, tenantId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`cms:page-paths:${tenantId}`}, 0))`);
}
