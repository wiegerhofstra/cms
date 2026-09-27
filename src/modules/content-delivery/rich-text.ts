import { CmsError } from "../../lib/cms/errors.ts";

export const richTextLimits = { documentValues: 2_000, responseValues: 20_000, depth: 100 } as const;

export function createRichTextAssetResolver(deliveryAsset: (id: string) => Promise<unknown>) {
  let responseValues = 0;
  return async function resolveDocument(value: unknown): Promise<unknown> {
    let documentValues = 0;
    async function visit(value: unknown, depth: number): Promise<unknown> {
      documentValues += 1;
      responseValues += 1;
      if (documentValues > richTextLimits.documentValues || responseValues > richTextLimits.responseValues || depth > richTextLimits.depth) {
        throw new CmsError("BAD_REQUEST", "Rich-text content is too deeply nested or complex to expand");
      }
      if (Array.isArray(value)) return Promise.all(value.map((item) => visit(item, depth + 1)));
      if (typeof value !== "object" || value === null) return value;
      const record = value as Record<string, unknown>;
      if (record.type === "asset" && typeof record.attrs === "object" && record.attrs !== null) {
        const attrs = record.attrs as Record<string, unknown>;
        if (typeof attrs.assetId === "string") return { ...record, attrs: { ...attrs, asset: await deliveryAsset(attrs.assetId) } };
      }
      return Object.fromEntries(await Promise.all(Object.entries(record).map(async ([key, nested]) => [key, await visit(nested, depth + 1)] as const)));
    }
    return visit(value, 0);
  };
}
