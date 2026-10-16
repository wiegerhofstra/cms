import assert from "node:assert/strict";
import { test } from "node:test";
import { createRichTextAssetResolver } from "./rich-text.ts";

const document = () => ({ type: "doc", content: Array.from({ length: 150 }, () => ({ type: "paragraph", content: [{ type: "text", text: "Content" }] })) });
test("multiple valid documents share a response without sharing the smaller document limit", async () => {
  const resolve = createRichTextAssetResolver(async () => null);
  const docs = [document(), document(), document()];
  assert.deepEqual(await Promise.all(docs.map(resolve)), docs);
});

test("per-document, response-wide and nesting limits still reject excessive input", async () => {
  const resolve = createRichTextAssetResolver(async () => null);
  await assert.rejects(resolve({ type: "doc", content: Array.from({ length: 2001 }, () => "value") }), /too deeply nested or complex/);
  const response = createRichTextAssetResolver(async () => null);
  await assert.rejects(Promise.all(Array.from({ length: 25 }, () => response(document()))), /too deeply nested or complex/);
  let deep = { type: "text", text: "Nested" };
  for (let i = 0; i < 101; i++) deep = { type: "blockquote", content: [deep] };
  await assert.rejects(createRichTextAssetResolver(async () => null)(deep), /too deeply nested or complex/);
});

test("table structure and media attributes survive delivery without mutating stored JSON", async () => {
  const input = { type: "doc", content: [{ type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", attrs: { colspan: 2 }, content: [{ type: "asset", attrs: { assetId: "image-1" } }] }] }] }] };
  const original = structuredClone(input);
  const delivered = await createRichTextAssetResolver(async (id) => ({ id, url: "https://example.invalid/image.jpg" }))(input);
  assert.equal(delivered.content[0].content[0].content[0].content[0].attrs.asset.id, "image-1");
  assert.deepEqual(input, original);
});

test("reference links resolve current destinations and never fall back to a stale stored href", async () => {
  const input = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Read more", marks: [
    { type: "link", attrs: { kind: "page", entryId: "page", href: "/old", target: "_blank" } },
    { type: "link", attrs: { kind: "asset", assetId: "pdf", href: "https://expired.invalid" } },
    { type: "link", attrs: { kind: "page", entryId: "missing", href: "/stale" } },
    { type: "link", attrs: { kind: "asset", assetId: "deleted", href: "/stale" } },
    { type: "link", attrs: { href: "https://example.com" } },
    { type: "link", attrs: { href: "javascript:alert(1)" } },
  ] }] }] };
  const original = structuredClone(input);
  const resolve = createRichTextAssetResolver(async (id) => id === "pdf" ? { downloadUrl: "https://cms.invalid/stable-pdf" } : null, async (id) => id === "page" ? { href: "/new" } : null);
  const delivered = await resolve(input);
  const marks = delivered.content[0].content[0].marks;
  assert.deepEqual(marks.map((mark) => mark.attrs.href), ["/new", "https://cms.invalid/stable-pdf", null, null, "https://example.com", null]);
  assert.equal(marks[0].attrs.target, "_blank");
  assert.equal(marks[2].attrs.missing, true);
  assert.deepEqual(input, original);
});
