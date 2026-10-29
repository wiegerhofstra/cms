import assert from "node:assert/strict";
import { test } from "node:test";
import { pageUrlSchema, resolvePagePath } from "../../lib/links.ts";
import { pageAncestors, resolveEntryPagePath } from "../../lib/page-hierarchy.ts";

test("hierarchy applies prefixes once and keeps individual slugs slash-free", () => {
  const config = { pattern: "/{locale}/pages/{slug}", slugField: "slug", hierarchy: true };
  assert.equal(resolvePagePath(config, { slug: "team" }, "nl", ["about", "company"]), "/nl/pages/about/company/team");
  assert.equal(resolvePagePath(config, { slug: "company/team" }, "nl"), null);
  assert.equal(resolvePagePath(config, { slug: "team" }, "nl", ["../about"]), null);
  for (const pattern of ["/", "/{slug}/details", "/{slug}/{locale}"]) {
    assert.equal(pageUrlSchema.safeParse({ ...config, pattern }).success, false);
  }
  assert.equal(pageUrlSchema.safeParse({ ...config, hierarchy: false, pattern: "/{slug}/details" }).success, true);
});

test("tree traversal is bounded and localized fallbacks apply independently at every level", () => {
  const model = { id: "page", pageUrl: { pattern: "/{locale}/{slug}", slugField: "slug", hierarchy: true }, fields: [{ key: "slug", type: "slug", localized: true }] };
  const graph = { models: new Map([[model.id, model]]), entries: new Map(), localization: { defaultLocale: "en", locales: ["en", "nl"] } };
  for (let i = 0; i < 101; i++) graph.entries.set(String(i), { id: String(i), modelId: "page", parentEntryId: null, pageParentId: i ? String(i - 1) : null, status: "published", data: { slug: "a" }, translations: i === 0 ? { nl: { slug: "b" } } : {} });
  assert.equal(resolveEntryPagePath(graph, "1", "nl", true), "/nl/b/a");
  assert.equal(pageAncestors(graph, "99").length, 100);
  assert.equal(pageAncestors(graph, "100"), null);
  graph.entries.get("0").status = "draft";
  assert.equal(resolveEntryPagePath(graph, "1", "nl", true), null);
  assert.equal(resolveEntryPagePath(graph, "1", "nl"), "/nl/b/a");
  graph.entries.get("0").pageParentId = "1";
  assert.equal(pageAncestors(graph, "1"), null);
});
