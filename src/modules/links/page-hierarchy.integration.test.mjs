import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import nextEnv from "@next/env";
import { eq, inArray } from "drizzle-orm";

// Exercise the real validation and delivery services with isolated, disposable tenants.
const src = path.resolve("src");
registerHooks({ resolve(specifier, context, nextResolve) {
  const candidate = specifier.startsWith("@/") ? path.join(src, specifier.slice(2)) :
    specifier.startsWith(".") && context.parentURL?.startsWith(pathToFileURL(`${src}/`).href) ? fileURLToPath(new URL(specifier, context.parentURL)) : null;
  if (candidate) for (const filename of [candidate, `${candidate}.ts`, path.join(candidate, "index.ts")]) {
    if (filename.endsWith(".ts") && existsSync(filename)) return { url: pathToFileURL(filename).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
} });
nextEnv.loadEnvConfig(process.cwd());

test("page hierarchies preserve routing and redirect ownership", async (t) => {
  const { db } = await import("../../db/index.ts");
  const { tenants, contentModels, contentModelFields, contentEntries, pagePathHistory, accessTokens, entryRevisions } = await import("../../db/schema/index.ts");
  const { loadPageGraph, publishedPagePaths, syncPagePaths, validatePageGraph, assertNoPageChildren, assertValidPageParent } = await import("../entries/page-paths.ts");
  const { lockPagePaths, validatePageUrlConfig } = await import("../entries/links.ts");
  const { validateEntryDataForPublish, validateEntryData, createEntryRevision } = await import("../entries/service.ts");
  const { getPublishedEntry, resolvePublishedPage } = await import("../content-delivery/service.ts");
  const { GET } = await import("../../app/api/content/[tenantSlug]/resolve/route.ts");
  const { hashAccessToken } = await import("../access-tokens/token.ts");

  async function scenario(name, check) {
    await t.test(name, async () => {
      const tenantId = crypto.randomUUID(), otherTenantId = crypto.randomUUID();
      const tenantSlug = `hierarchy-${tenantId}`;
      const modelId = crypto.randomUUID(), foreignModelId = crypto.randomUUID();
      const a = crypto.randomUUID(), b = crypto.randomUUID(), child = crypto.randomUUID(), otherChild = crypto.randomUUID(), grandchild = crypto.randomUUID(), foreign = crypto.randomUUID();
      const config = { pattern: "/{locale}/{slug}", slugField: "slug", hierarchy: true };
      const entry = (id, slug, pageParentId = null, translated = slug) => ({ id, tenantId, modelId, pageParentId, status: "published", data: { slug }, translations: { nl: { slug: translated } } });
      const read = (path, locale = "en", tenant = tenantId) => resolvePublishedPage({ tenantId: tenant, path, locale, maxDepth: 1 });
      const mutate = (fn) => db.transaction(async (tx) => {
        await lockPagePaths(tx, tenantId);
        const before = publishedPagePaths(await loadPageGraph(tx, tenantId));
        await fn(tx);
        await syncPagePaths(tx, tenantId, before);
      });
      const edit = (id, changes) => mutate(async (tx) => {
        const [saved] = await tx.update(contentEntries).set(changes).where(eq(contentEntries.id, id)).returning();
        if (saved.status === "published") await validateEntryDataForPublish(tx, tenantId, modelId, saved.data, id, saved.translations);
        else await validateEntryData(tx, tenantId, modelId, saved.data, id, saved.translations);
      });
      try {
        await db.insert(tenants).values([{ id: tenantId, slug: tenantSlug, name: "Temporary hierarchy test", locales: ["en", "nl"] }, { id: otherTenantId, slug: `hierarchy-${otherTenantId}`, name: "Other tenant" }]);
        await db.insert(contentModels).values([{ id: modelId, tenantId, name: "Pages", slug: "page", pageUrl: config }, { id: foreignModelId, tenantId: otherTenantId, name: "Foreign", slug: "page", pageUrl: config }]);
        await db.insert(contentModelFields).values([
          { tenantId, modelId, key: "slug", label: "Slug", type: "slug", required: true, localized: true, config: { unique: true }, position: 0 },
          { tenantId, modelId, key: "body", label: "Body", type: "rich_text", position: 1 },
          { tenantId: otherTenantId, modelId: foreignModelId, key: "slug", label: "Slug", type: "slug", required: true, position: 0 },
        ]);
        await db.insert(contentEntries).values([entry(a, "services", null, "diensten"), entry(b, "products", null, "producten"), { ...entry(foreign, "private"), tenantId: otherTenantId, modelId: foreignModelId }]);
        await db.insert(contentEntries).values([entry(child, "contact", a), entry(otherChild, "contact", b)]);
        await db.insert(contentEntries).values(entry(grandchild, "details", child));
        await check({ tenantId, otherTenantId, tenantSlug, modelId, foreignModelId, a, b, child, otherChild, grandchild, foreign, config, entry, read, edit, mutate });
      } finally {
        await db.update(contentEntries).set({ pageParentId: null }).where(inArray(contentEntries.tenantId, [tenantId, otherTenantId]));
        await db.delete(contentEntries).where(inArray(contentEntries.tenantId, [tenantId, otherTenantId]));
        await db.delete(contentModelFields).where(inArray(contentModelFields.tenantId, [tenantId, otherTenantId]));
        await db.delete(contentModels).where(inArray(contentModels.tenantId, [tenantId, otherTenantId]));
        await db.delete(tenants).where(inArray(tenants.id, [tenantId, otherTenantId]));
      }
    });
  }

  try {
    await scenario("sibling uniqueness permits the same slug in different branches, including localized fallbacks", async ({ tenantId, modelId, a, b, child, otherChild, read, edit }) => {
      await validatePageGraph(db, tenantId, await loadPageGraph(db, tenantId));
      await validateEntryDataForPublish(db, tenantId, modelId, { slug: "contact" }, child, {});
      assert.equal((await read("/en/services/contact")).result.entry.id, child);
      assert.equal((await read("/nl/diensten/contact", "nl")).result.entry.id, child);
      assert.equal((await read("/en/products/contact")).result.entry.id, otherChild);
      await assert.rejects(edit(otherChild, { pageParentId: a }), /Sibling pages/);
      await assert.rejects(edit(b, { data: { slug: "services" } }), /Sibling pages/);
      await assert.rejects(edit(b, { translations: { nl: { slug: "diensten" } } }), /Sibling pages/);
      await edit(otherChild, { data: { slug: "support" }, translations: {}, pageParentId: a });
      assert.equal((await read("/en/services/support")).result.entry.id, otherChild);
    });

    await scenario("cycles, foreign parents, disabled hierarchy and embedded blocks are rejected", async ({ tenantId, modelId, a, child, foreign, config, edit, mutate }) => {
      await assert.rejects(edit(a, { pageParentId: child }), /ancestor|published ancestor/);
      await assert.rejects(edit(a, { pageParentId: a }), /ancestor|published ancestor/);
      await assert.rejects(assertValidPageParent(db, tenantId, modelId, foreign), /same model and tenant/);
      await assert.rejects(assertValidPageParent(db, tenantId, modelId, crypto.randomUUID()), /available parent/);
      await assert.rejects(edit(child, { pageParentId: foreign }), /same model and tenant/);
      await assert.rejects(validatePageUrlConfig(db, tenantId, modelId, { ...config, hierarchy: false }), /Enable parent/);
      await assert.rejects(mutate((tx) => tx.update(contentEntries).set({ parentEntryId: a }).where(eq(contentEntries.id, child))), /Embedded blocks|Choose a parent page/);
    });

    await scenario("parent renames and moves redirect all descendants directly after repeated changes", async ({ a, b, child, grandchild, read, edit }) => {
      await edit(a, { data: { slug: "care" } });
      assert.deepEqual((await read("/en/services/contact/details")).result, { kind: "redirect", location: "/en/care/contact/details", status: 308 });
      await edit(a, { data: { slug: "help" }, pageParentId: b });
      assert.equal((await read("/en/services/contact/details")).result.location, "/en/products/help/contact/details");
      assert.equal((await read("/en/care/contact/details")).result.location, "/en/products/help/contact/details");
      assert.equal((await read("/en/products/help/contact/details")).result.entry.id, grandchild);
      assert.equal((await read("/nl/diensten/contact", "nl")).result.location, "/nl/producten/diensten/contact");
      await edit(a, { data: { slug: "services" }, pageParentId: null });
      assert.equal((await read("/en/services/contact")).result.entry.id, child);
      assert.equal((await read("/en/products/help/contact")).result.location, "/en/services/contact");
    });

    await scenario("historical URLs remain reserved and collision failures roll back both content and history", async ({ tenantId, a, b, read, edit, mutate }) => {
      await edit(a, { data: { slug: "care" } });
      const before = await db.select().from(pagePathHistory).where(eq(pagePathHistory.tenantId, tenantId));
      await assert.rejects(edit(b, { data: { slug: "services" } }), /reserved/);
      assert.equal((await read("/en/products")).result.entry.id, b);
      assert.deepEqual(await db.select().from(pagePathHistory).where(eq(pagePathHistory.tenantId, tenantId)), before);
      const collisionId = crypto.randomUUID();
      await assert.rejects(mutate(async (tx) => {
        await tx.insert(contentModels).values({ id: collisionId, tenantId, name: "Fixed", slug: "fixed", pageUrl: { pattern: "/en/care", slugField: null } });
        await tx.insert(contentEntries).values({ tenantId, modelId: collisionId, status: "published" });
      }), /Two pages use/);
      assert.equal((await db.select().from(contentModels).where(eq(contentModels.id, collisionId))).length, 0);
    });

    await scenario("draft edits create no redirects and publishing requires published ancestors", async ({ a, read, entry, edit, mutate }) => {
      const id = crypto.randomUUID();
      await mutate((tx) => tx.insert(contentEntries).values({ ...entry(id, "draft"), status: "draft" }));
      await edit(id, { data: { slug: "renamed-draft" } });
      assert.equal((await db.select().from(pagePathHistory).where(eq(pagePathHistory.entryId, id))).length, 0);
      await assert.rejects(edit(a, { pageParentId: id }), /published ancestor/);
      await assert.rejects(read("/en/renamed-draft"), /not found/);
      await edit(id, { status: "published" });
      assert.equal((await read("/en/renamed-draft")).result.entry.id, id);
      await assert.rejects(read("/en/draft"), /not found/);
      await assert.rejects(mutate((tx) => tx.insert(contentEntries).values({ ...entry(crypto.randomUUID(), "renamed-draft"), status: "draft" })), /Sibling pages/);
    });

    await scenario("deletion and unpublication protect children and never redirect to unavailable destinations", async ({ tenantId, a, grandchild, read, edit, mutate }) => {
      await assert.rejects(assertNoPageChildren(db, tenantId, a), /children first/);
      await assert.rejects(assertNoPageChildren(db, tenantId, a, true), /children first/);
      await edit(grandchild, { data: { slug: "more" } });
      await assertNoPageChildren(db, tenantId, grandchild, true);
      await edit(grandchild, { status: "draft" });
      await assert.rejects(read("/en/services/contact/details"), /not found/);
      await edit(grandchild, { status: "published" });
      assert.equal((await read("/en/services/contact/details")).result.location, "/en/services/contact/more");
      await mutate((tx) => tx.update(contentEntries).set({ deletedAt: new Date() }).where(eq(contentEntries.id, grandchild)));
      await assert.rejects(read("/en/services/contact/details"), /not found/);
    });

    await scenario("URL pattern and localization changes keep old paths working", async ({ modelId, child, config, read, mutate }) => {
      await mutate((tx) => tx.update(contentModels).set({ pageUrl: { ...config, pattern: "/{locale}/pages/{slug}" } }).where(eq(contentModels.id, modelId)));
      assert.equal((await read("/en/services/contact")).result.location, "/en/pages/services/contact");
      await mutate((tx) => tx.update(contentModelFields).set({ localized: false }).where(eq(contentModelFields.modelId, modelId)));
      assert.equal((await read("/nl/diensten/contact", "nl")).result.location, "/nl/pages/services/contact");
      assert.equal((await read("/nl/pages/services/contact", "nl")).result.entry.id, child);
    });

    await scenario("rich-text links and delivery use the full localized path, while revisions retain the parent", async ({ tenantId, a, child, edit }) => {
      const body = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Contact", marks: [{ type: "link", attrs: { kind: "page", entryId: child } }] }] }] };
      await edit(a, { data: { slug: "services", body } });
      const result = await getPublishedEntry({ tenantId, modelSlug: "page", entryId: a, locale: "nl", maxDepth: 1 });
      assert.equal(result.entry.data.body.content[0].content[0].marks[0].attrs.href, "/nl/diensten/contact");
      const childResult = await getPublishedEntry({ tenantId, modelSlug: "page", entryId: child, locale: "nl", maxDepth: 1 });
      assert.equal(childResult.entry.pageParentId, a);
      await db.transaction((tx) => createEntryRevision(tx, { tenantId, entryId: child, data: { slug: "contact" }, userId: null }));
      assert.equal((await db.select().from(entryRevisions).where(eq(entryRevisions.entryId, child)))[0].pageParentId, a);
    });

    await scenario("simultaneous claims are serialized and only one page wins", async ({ tenantId, a, b, edit, read }) => {
      const outcomes = await Promise.allSettled([edit(a, { data: { slug: "claimed" } }), edit(b, { data: { slug: "claimed" } })]);
      assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
      assert.match(outcomes.find((outcome) => outcome.status === "rejected").reason.message, /Sibling pages/);
      assert.equal((await read("/en/claimed")).result.kind, "page");
      await validatePageGraph(db, tenantId, await loadPageGraph(db, tenantId));
    });

    await scenario("resolve endpoint enforces authentication, tenant boundaries and valid paths", async ({ tenantId, otherTenantId, tenantSlug, child, a, edit }) => {
      const token = `cms_at_${crypto.randomUUID()}`;
      await db.insert(accessTokens).values({ tenantId, name: "Temporary hierarchy test", tokenHash: hashAccessToken(token), tokenHint: "test" });
      const request = (path, authorization = token, slug = tenantSlug) => GET(new Request(`http://localhost/api/content/${slug}/resolve?${new URLSearchParams({ path, locale: "en" })}`, { headers: authorization ? { authorization: `Bearer ${authorization}` } : {} }), { params: Promise.resolve({ tenantSlug: slug }) });
      assert.equal((await request("/en/services/contact", null)).status, 401);
      assert.equal((await request("/en/services/contact", token, `hierarchy-${otherTenantId}`)).status, 403);
      assert.equal((await request("/en/unknown")).status, 404);
      for (const path of ["//evil.test", "/../private", "/a/", "/a?b", "/a#b", "/a%2fb", ""]) assert.equal((await request(path)).status, 400, path);
      const page = await request("/en/services/contact");
      assert.equal(page.headers.get("cache-control"), "private, no-store");
      assert.equal((await page.json()).data.entry.id, child);
      await edit(a, { data: { slug: "care" } });
      const redirected = await request("/en/services/contact");
      assert.equal(redirected.status, 200);
      assert.deepEqual((await redirected.json()).data, { kind: "redirect", location: "/en/care/contact", status: 308 });
    });
  } finally {
    await globalThis.cmsPool?.end();
    globalThis.cmsS3Client?.destroy();
  }
});
