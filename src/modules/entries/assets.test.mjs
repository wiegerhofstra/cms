import assert from "node:assert/strict";
import { test } from "node:test";
import { referencedAssetIds } from "./assets.ts";

test("finds selected and nested rich-text images beyond the asset picker page", () => {
  const a = "11111111-1111-4111-8111-111111111111";
  const b = "22222222-2222-4222-8222-222222222222";
  const fields = [{ key: "image", type: "asset" }, { key: "content", type: "rich_text" }, { key: "title", type: "text" }];
  const data = { image: a, title: b, stale: b, content: { type: "doc", content: [
    { type: "asset", attrs: { assetId: a } }, { type: "blockquote", content: [{ type: "asset", attrs: { assetId: b } }] },
    { type: "asset", attrs: { assetId: "invalid" } },
  ] } };
  assert.deepEqual(referencedAssetIds(fields, data), [a, b]);
  assert.deepEqual(referencedAssetIds(fields, { image: "invalid", content: null, title: a, stale: b }), []);
});
