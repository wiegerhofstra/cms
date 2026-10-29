"use server";

import { z } from "zod";
import { db } from "@/db";
import { requireTenantContext } from "@/lib/cms/context";
import { CmsError } from "@/lib/cms/errors";
import { pageAncestors, pageSlug } from "@/lib/page-hierarchy";
import { richTextPlainText } from "@/lib/rich-text";
import { loadPageGraph } from "./page-paths";

/** Returns only labels and URL segments, never another page's body. */
export async function getPageParentOptions(tenantSlug: string, modelId: string, entryId?: string) {
  const context = await requireTenantContext(crypto.randomUUID(), tenantSlug);
  if (!z.uuid().safeParse(modelId).success || (entryId && !z.uuid().safeParse(entryId).success)) throw new CmsError("BAD_REQUEST", "Invalid page selection");
  const graph = await loadPageGraph(db, context.activeTenantId);
  const model = graph.models.get(modelId);
  if (!model?.pageUrl?.hierarchy) return [];
  const titleKey = model.fields.find((field) => field.isTitle)?.key;
  return [...graph.entries.values()].flatMap((entry) => {
    if (entry.modelId !== modelId || entry.parentEntryId) return [];
    const chain = pageAncestors(graph, entry.id);
    if (!chain || chain.some((node) => node.id === entryId)) return [];
    return [{
      id: entry.id, title: (titleKey ? richTextPlainText(entry.data[titleKey]) : "") || "Untitled page", status: entry.status,
      slugs: Object.fromEntries(graph.localization.locales.map((locale) => {
        const slugs = chain.map((node) => pageSlug(graph, node, locale));
        return [locale, slugs.every((slug) => typeof slug === "string" && /^[a-z0-9_-]+$/.test(slug)) ? slugs as string[] : null];
      })),
    }];
  }).sort((a, b) => a.title.localeCompare(b.title));
}
