import { resolvePagePath, type PageUrlConfig } from "./links.ts";
import { localizeEntryData, type EntryTranslations, type TenantLocalization } from "../modules/localization/locales.ts";

export type PageEntry = {
  id: string; modelId: string; pageParentId: string | null; parentEntryId: string | null;
  status: "draft" | "published"; data: Record<string, unknown>; translations: EntryTranslations;
};
export type PageModel = {
  id: string; pageUrl: PageUrlConfig | null;
  fields: { key: string; type: string; localized: boolean; isTitle?: boolean }[];
};
export type PageGraph = {
  entries: Map<string, PageEntry>; models: Map<string, PageModel>; localization: TenantLocalization;
};

/** Iterative and bounded so corrupt legacy trees cannot recurse indefinitely. */
export function pageAncestors(graph: PageGraph, id: string, publishedOnly = false): PageEntry[] | null {
  const entry = graph.entries.get(id);
  if (!entry || entry.parentEntryId || (publishedOnly && entry.status !== "published")) return null;
  const config = graph.models.get(entry.modelId)?.pageUrl;
  if (!config || (entry.pageParentId && !config.hierarchy)) return null;
  const chain = [entry];
  const seen = new Set([id]);
  let parentId = entry.pageParentId;
  while (parentId) {
    const parent = graph.entries.get(parentId);
    if (!parent || parent.modelId !== entry.modelId || parent.parentEntryId || seen.has(parentId) || chain.length >= 100 || (publishedOnly && parent.status !== "published")) return null;
    seen.add(parentId);
    chain.push(parent);
    parentId = parent.pageParentId;
  }
  return chain.reverse();
}

export function pageSlug(graph: PageGraph, entry: PageEntry, locale: string): unknown {
  const model = graph.models.get(entry.modelId);
  const key = model?.pageUrl?.slugField;
  return model && key ? localizeEntryData(model.fields, entry.data, entry.translations, locale, graph.localization)[key] : undefined;
}

export function resolveEntryPagePath(graph: PageGraph, id: string, locale: string, publishedOnly = false): string | null {
  const chain = pageAncestors(graph, id, publishedOnly);
  if (!chain) return null;
  const entry = chain.at(-1)!;
  const model = graph.models.get(entry.modelId)!;
  const ancestors = chain.slice(0, -1).map((parent) => pageSlug(graph, parent, locale));
  if (ancestors.some((slug) => typeof slug !== "string")) return null;
  const path = resolvePagePath(model.pageUrl, localizeEntryData(model.fields, entry.data, entry.translations, locale, graph.localization), locale, ancestors as string[]);
  return path && path.length <= 2000 ? path : null;
}
