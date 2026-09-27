import { z } from "zod";

export function referencedAssetIds(fields: { key: string; type: string }[], data: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  const add = (value: unknown) => { if (typeof value === "string" && z.uuid().safeParse(value).success) ids.add(value); };
  for (const field of fields) {
    if (field.type === "asset") add(data[field.key]);
    if (field.type !== "rich_text") continue;
    const pending: unknown[] = [data[field.key]];
    while (pending.length) {
      const node = pending.pop();
      if (!node || typeof node !== "object" || Array.isArray(node)) continue;
      const record = node as { type?: unknown; attrs?: { assetId?: unknown }; content?: unknown };
      if (record.type === "asset") add(record.attrs?.assetId);
      if (Array.isArray(record.content)) pending.push(...record.content);
    }
  }
  return [...ids];
}
