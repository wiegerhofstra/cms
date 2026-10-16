import { z } from "zod";

/** Paths are relative to the consuming website. Only complete path segments may be substituted. */
export const pageUrlSchema = z.object({
  pattern: z.string().trim().max(300).refine((value) =>
    value === "/" || /^\/(?:[a-z0-9_-]+|\{slug\}|\{locale\})(?:\/(?:[a-z0-9_-]+|\{slug\}|\{locale\}))*$/.test(value),
  "Use a path such as /news/{slug}, /{locale}/{slug}, or /"),
  slugField: z.string().regex(/^[a-z][a-z0-9_]*$/).nullable(),
}).refine((value) => !value.pattern.includes("{slug}") || Boolean(value.slugField), {
  message: "Choose a slug field for this URL pattern", path: ["slugField"],
}).refine((value) => value.pattern.split("{slug}").length <= 2 && value.pattern.split("{locale}").length <= 2, {
  message: "Use each placeholder only once", path: ["pattern"],
});

export type PageUrlConfig = z.infer<typeof pageUrlSchema>;

export function resolvePagePath(config: PageUrlConfig | null | undefined, data: Record<string, unknown>, locale: string): string | null {
  if (!config || !pageUrlSchema.safeParse(config).success) return null;
  let path = config.pattern;
  if (path.includes("{slug}")) {
    const slug = config.slugField ? data[config.slugField] : undefined;
    if (typeof slug !== "string" || !/^[a-z0-9_-]+$/.test(slug)) return null;
    path = path.replace("{slug}", slug);
  }
  return path.replace("{locale}", encodeURIComponent(locale));
}

export function safeLinkHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const href = value.trim();
  if (!href || /[\s\\\u0000-\u001f\u007f]/.test(href)) return null;
  if ((href.startsWith("/") && !href.startsWith("//")) || href.startsWith("#") || href.startsWith("?")) return href;
  try { return ["http:", "https:", "mailto:", "tel:"].includes(new URL(href).protocol) ? href : null; }
  catch { return null; }
}

export type LinkKind = "url" | "page" | "asset";
export type LinkDestination = {
  id: string;
  kind: "page" | "asset";
  title: string;
  detail: string;
  href: string | null;
  status: "draft" | "published" | "ready";
};

export type RichTextLink = {
  kind: LinkKind;
  href: string | null;
  entryId: string | null;
  assetId: string | null;
  target: string | null;
};

/** Visits nodes and marks, with bounded work for editor JSON submitted by clients. */
export function richTextLinks(value: unknown): Record<string, unknown>[] {
  const links: Record<string, unknown>[] = [];
  const pending = [{ value, depth: 0 }];
  let visited = 0;
  while (pending.length) {
    const { value: item, depth } = pending.pop()!;
    if (++visited > 20_000 || depth > 100) throw new Error("Rich text is too deeply nested or complex");
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const node = item as Record<string, unknown>;
    if (node.type === "link" && node.attrs && typeof node.attrs === "object" && !Array.isArray(node.attrs)) links.push(node.attrs as Record<string, unknown>);
    for (const children of [node.content, node.marks]) {
      if (Array.isArray(children)) {
        if (children.length + pending.length > 20_000) throw new Error("Rich text is too deeply nested or complex");
        for (const child of children) pending.push({ value: child, depth: depth + 1 });
      }
    }
  }
  return links;
}
