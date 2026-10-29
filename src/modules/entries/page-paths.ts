import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { contentEntries, contentModelFields, contentModels, pagePathHistory } from "@/db/schema";
import { CmsError } from "@/lib/cms/errors";
import { pageAncestors, pageSlug, resolveEntryPagePath, type PageGraph } from "@/lib/page-hierarchy";
import { getTenantLocalization } from "@/modules/localization/tenant";

type ReadDb = Pick<Db, "select">;
export type PagePath = { entryId: string; locale: string; path: string };

export async function assertValidPageParent(db: ReadDb, tenantId: string, modelId: string, pageParentId: string | null | undefined) {
  if (!pageParentId) return;
  const [model] = await db.select({ pageUrl: contentModels.pageUrl }).from(contentModels).where(and(eq(contentModels.tenantId, tenantId), eq(contentModels.id, modelId)));
  const [parent] = await db.select({ id: contentEntries.id }).from(contentEntries).where(and(
    eq(contentEntries.tenantId, tenantId), eq(contentEntries.modelId, modelId), eq(contentEntries.id, pageParentId),
    isNull(contentEntries.deletedAt), isNull(contentEntries.parentEntryId),
  ));
  if (!model?.pageUrl?.hierarchy || !parent) throw new CmsError("VALIDATION_ERROR", "Choose an available parent page in the same model and tenant, with parent pages enabled.");
}

export async function loadPageGraph(db: ReadDb, tenantId: string): Promise<PageGraph> {
  const [entries, models, fields, localization] = await Promise.all([
    db.select().from(contentEntries).where(and(eq(contentEntries.tenantId, tenantId), isNull(contentEntries.deletedAt))),
    db.select().from(contentModels).where(eq(contentModels.tenantId, tenantId)),
    db.select().from(contentModelFields).where(eq(contentModelFields.tenantId, tenantId)),
    getTenantLocalization(db, tenantId),
  ]);
  return { entries: new Map(entries.map((entry) => [entry.id, entry])), models: new Map(models.map((model) => [model.id, { ...model, fields: fields.filter((field) => field.modelId === model.id) }])), localization };
}

export function publishedPagePaths(graph: PageGraph, strict = false): PagePath[] {
  const paths: PagePath[] = [];
  for (const entry of graph.entries.values()) {
    if (entry.status !== "published" || entry.parentEntryId || !graph.models.get(entry.modelId)?.pageUrl) continue;
    for (const locale of graph.localization.locales) {
      const path = resolveEntryPagePath(graph, entry.id, locale, true);
      if (!path && strict) throw new CmsError("VALIDATION_ERROR", `A published page is missing its URL slug or a published ancestor (${locale}). Publish its parents first and check the path length (maximum 2000 characters).`);
      if (path) paths.push({ entryId: entry.id, locale, path });
    }
  }
  return paths;
}

export function validatePageHierarchy(graph: PageGraph) {
  const siblings = new Map<string, string>();
  for (const entry of graph.entries.values()) {
    const config = graph.models.get(entry.modelId)?.pageUrl;
    if (entry.pageParentId && (!config?.hierarchy || entry.parentEntryId)) throw new CmsError("VALIDATION_ERROR", "Enable parent pages on this model before choosing a parent. Embedded blocks cannot be pages.");
    if (!config?.hierarchy || entry.parentEntryId) continue;
    if (!pageAncestors(graph, entry.id)) throw new CmsError("VALIDATION_ERROR", "Choose a parent page in the same model and tenant. A page cannot be its own ancestor, and trees cannot exceed 100 levels.");
    for (const locale of graph.localization.locales) {
      const slug = pageSlug(graph, entry, locale);
      if (slug === undefined || slug === null || slug === "") continue;
      const key = JSON.stringify([entry.modelId, entry.pageParentId, locale, slug]);
      if (siblings.has(key)) throw new CmsError("CONFLICT", `Sibling pages must use different slugs (${locale}): ${slug}`);
      siblings.set(key, entry.id);
    }
  }
}

export async function validatePageGraph(db: ReadDb, tenantId: string, graph: PageGraph) {
  validatePageHierarchy(graph);
  const paths = publishedPagePaths(graph, true);
  const used = new Map<string, string>();
  for (const { entryId, locale, path } of paths) {
    const key = JSON.stringify([locale, path]);
    if (used.has(key) && used.get(key) !== entryId) throw new CmsError("CONFLICT", `Two pages use ${path} (${locale}). Choose a different slug or URL pattern.`);
    used.set(key, entryId);
  }
  const history = await db.select().from(pagePathHistory).where(eq(pagePathHistory.tenantId, tenantId));
  for (const old of history) {
    const owner = used.get(JSON.stringify([old.locale, old.path]));
    if (owner && owner !== old.entryId) throw new CmsError("CONFLICT", `The path ${old.path} (${old.locale}) is reserved by another page's redirect.`);
  }
}

/** Caller holds the tenant page-path lock. The mutation and history are committed together. */
export async function syncPagePaths(tx: Pick<Db, "select" | "insert">, tenantId: string, before: PagePath[]) {
  const graph = await loadPageGraph(tx, tenantId);
  const changed = before.filter((old) => resolveEntryPagePath(graph, old.entryId, old.locale, true) !== old.path);
  if (changed.length) await tx.insert(pagePathHistory).values(changed.map((old) => ({ tenantId, ...old }))).onConflictDoNothing();
  await validatePageGraph(tx, tenantId, graph);
}

export async function assertNoPageChildren(db: ReadDb, tenantId: string, entryId: string, publishedOnly = false) {
  const [child] = await db.select({ id: contentEntries.id }).from(contentEntries).where(and(
    eq(contentEntries.tenantId, tenantId), eq(contentEntries.pageParentId, entryId), isNull(contentEntries.deletedAt),
    publishedOnly ? eq(contentEntries.status, "published") : undefined,
  )).limit(1);
  if (child) throw new CmsError("CONFLICT", publishedOnly ? "Move or unpublish this page's published children first." : "Move or delete this page's children first.");
}
