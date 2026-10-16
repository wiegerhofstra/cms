import assert from "node:assert/strict";
import { test } from "node:test";
import { pageUrlSchema, resolvePagePath, richTextLinks, safeLinkHref } from "../../lib/links.ts";
import { localizeEntryData } from "../localization/locales.ts";

test("page paths use the configured slug, fixed routes, and localized fallbacks", () => {
  const config = { pattern: "/{locale}/news/{slug}", slugField: "path" };
  const fields = [{ key: "path", type: "slug", localized: true }];
  const localization = { defaultLocale: "en", locales: ["en", "nl", "de"] };
  const data = { path: "care" }, translations = { nl: { path: "zorg" } };
  assert.equal(resolvePagePath(config, localizeEntryData(fields, data, translations, "nl", localization), "nl"), "/nl/news/zorg");
  assert.equal(resolvePagePath(config, localizeEntryData(fields, data, translations, "de", localization), "de"), "/de/news/care");
  assert.equal(resolvePagePath({ pattern: "/", slugField: null }, {}, "en"), "/");
  assert.equal(resolvePagePath(config, {}, "en"), null);
  assert.equal(resolvePagePath(null, data, "en"), null);
  assert.equal(resolvePagePath(config, { path: "../bad" }, "en"), null);
});

test("page URL configuration rejects external URLs, traversal and unknown or repeated placeholders", () => {
  for (const pattern of ["https://example.com/{slug}", "//example.com", "/../{slug}", "/{title}", "/{slug}/{slug}", "/{locale}/{locale}", "/foo?bar", "/foo\\bar", "/foo//bar", "/foo/{slug}/"]) {
    assert.equal(pageUrlSchema.safeParse({ pattern, slugField: "slug" }).success, false, pattern);
  }
  assert.equal(pageUrlSchema.safeParse({ pattern: "/{slug}", slugField: null }).success, false);
});

test("web links allow expected schemes and paths and reject unsafe URL variants", () => {
  for (const href of ["https://example.com/a?q=x", "http://example.com", "mailto:hello@example.com", "tel:+3112345", "/care", "#details", "?page=2"]) assert.equal(safeLinkHref(href), href);
  for (const href of ["javascript:alert(1)", "data:text/html,bad", "//evil.example", "/\\evil.example", "java\nscript:bad", "https://exa mple.com", ""]) assert.equal(safeLinkHref(href), null);
});

test("rich text traversal finds nested marks and rejects oversized content", () => {
  const link = { kind: "page", entryId: "page" };
  assert.deepEqual(richTextLinks({ type: "doc", content: [{ type: "tableCell", content: [{ type: "text", marks: [{ type: "link", attrs: link }] }] }] }), [link]);
  let deep = { type: "text" };
  for (let i = 0; i < 102; i++) deep = { type: "blockquote", content: [deep] };
  assert.throws(() => richTextLinks(deep), /too deeply nested/);
});
