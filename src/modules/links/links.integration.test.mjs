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

test("page and asset links validate and resolve through the database", async (t) => {
  const { db } = await import("../../db/index.ts");
  const { tenants, contentModels, contentModelFields, contentEntries, assets } = await import("../../db/schema/index.ts");
  const { validateEntryDataForPublish, validateEntryData } = await import("../entries/service.ts");
  const { validatePagePaths, validatePageUrlConfig } = await import("../entries/links.ts");
  const { getPublishedEntry, getDeliveryAsset } = await import("../content-delivery/service.ts");
  const { GET: download } = await import("../../app/api/media/[tenantId]/[assetId]/[token]/route.ts");
  const tenantId = crypto.randomUUID(), otherTenantId = crypto.randomUUID();
  const modelId = crypto.randomUUID(), targetId = crypto.randomUUID(), rootId = crypto.randomUUID(), assetId = crypto.randomUUID(), foreignAssetId = crypto.randomUUID();
  const foreignModelId = crypto.randomUUID(), foreignEntryId = crypto.randomUUID();
  const pageUrl = { pattern: "/{locale}/{slug}", slugField: "slug" };
  const document = (links) => ({ type: "doc", content: [{ type: "paragraph", content: links.map((attrs) => ({ type: "text", text: "Read more", marks: [{ type: "link", attrs }] })) }] });
  const data = { slug: "source", body: document([{ kind: "page", entryId: targetId, href: "/stale" }, { kind: "asset", assetId, href: "https://expired.invalid" }]) };
  const read = () => getPublishedEntry({ tenantId, modelSlug: "page", entryId: rootId, maxDepth: 1, locale: "nl" });
  const mark = (result, index) => result.entry.data.body.content[0].content[index].marks[0].attrs;
  try {
    await db.insert(tenants).values([tenantId, otherTenantId].map((id) => ({ id, name: "Temporary link verification", slug: `link-test-${id}`, locales: ["en", "nl"] })));
    await db.insert(contentModels).values([
      { id: modelId, tenantId, name: "Page", slug: "page", pageUrl },
      { id: foreignModelId, tenantId: otherTenantId, name: "Private page", slug: "page", pageUrl },
    ]);
    await db.insert(contentModelFields).values([
      { tenantId, modelId, key: "slug", label: "Slug", type: "slug", required: true, localized: true, config: { unique: true }, position: 0 },
      { tenantId, modelId, key: "body", label: "Body", type: "rich_text", localized: true, position: 1 },
    ]);
    await db.insert(contentEntries).values([
      { id: targetId, tenantId, modelId, status: "published", data: { slug: "care" }, translations: { nl: { slug: "zorg" } } },
      { id: rootId, tenantId, modelId, status: "published", data },
      { id: foreignEntryId, tenantId: otherTenantId, modelId: foreignModelId, status: "published", data: { slug: "private-page" } },
    ]);
    await db.insert(assets).values([
      { id: assetId, tenantId, bucket: "test", objectKey: `test/${assetId}`, originalName: "brochure.pdf", mimeType: "application/pdf", sizeBytes: 123, status: "ready" },
      { id: foreignAssetId, tenantId: otherTenantId, bucket: "test", objectKey: `test/${foreignAssetId}`, originalName: "private.pdf", mimeType: "application/pdf", sizeBytes: 123, status: "ready" },
    ]);

    await t.test("published links deliver localized paths, durable file URLs and preserve stored references", async () => {
      await validatePageUrlConfig(db, tenantId, modelId, pageUrl);
      await validateEntryDataForPublish(db, tenantId, modelId, data, rootId);
      const delivered = await read();
      assert.equal(delivered.entry.url, "/nl/source");
      assert.equal(mark(delivered, 0).href, "/nl/zorg");
      assert.ok(new URL(mark(delivered, 1).href).pathname.startsWith(`/api/media/${tenantId}/${assetId}/`));
      assert.equal(mark(delivered, 1).href, (await getDeliveryAsset(tenantId, assetId)).downloadUrl);
      const [stored] = await db.select().from(contentEntries).where(eq(contentEntries.id, rootId));
      assert.deepEqual(stored.data, data);
    });

    await t.test("changing a slug updates links; missing translations use the default slug", async () => {
      await db.update(contentEntries).set({ data: { slug: "new-care" }, translations: {} }).where(eq(contentEntries.id, targetId));
      assert.equal(mark(await read(), 0).href, "/nl/new-care");
    });

    await t.test("draft targets can be saved in drafts but block publication and resolve without stale URLs", async () => {
      await db.update(contentEntries).set({ status: "draft" }).where(eq(contentEntries.id, targetId));
      await validateEntryData(db, tenantId, modelId, data, rootId);
      await assert.rejects(validateEntryDataForPublish(db, tenantId, modelId, data, rootId), /still a draft/);
      assert.equal(mark(await read(), 0).href, null);
      assert.equal(mark(await read(), 0).missing, true);
      await db.update(contentEntries).set({ status: "published" }).where(eq(contentEntries.id, targetId));
    });

    await t.test("duplicate paths, fixed-route collisions and missing slugs are rejected", async () => {
      await assert.rejects(validatePagePaths(db, tenantId, { modelId, entry: { id: rootId, data: { slug: "new-care" }, translations: {} } }), /Two pages use/);
      await assert.rejects(validatePageUrlConfig(db, tenantId, modelId, { pattern: "/", slugField: null }), /Two pages use/);
      await assert.rejects(validatePagePaths(db, tenantId, { modelId, entry: { id: rootId, data: {}, translations: {} } }), /missing its URL slug/);
      await assert.rejects(validatePageUrlConfig(db, tenantId, modelId, { pattern: "/{slug}", slugField: "body" }), /Required and Unique/);
    });

    await t.test("cross-tenant references are unavailable and never receive a download capability", async () => {
      const foreign = { slug: "source", body: document([{ kind: "asset", assetId: foreignAssetId }]) };
      await assert.rejects(validateEntryDataForPublish(db, tenantId, modelId, foreign, rootId), /asset link is unavailable/);
      await db.update(contentEntries).set({ data: foreign }).where(eq(contentEntries.id, rootId));
      assert.equal(mark(await read(), 0).href, null);
      const foreignPage = { slug: "source", body: document([{ kind: "page", entryId: foreignEntryId }]) };
      await assert.rejects(validateEntryDataForPublish(db, tenantId, modelId, foreignPage, rootId), /page link is unavailable/);
      await db.update(contentEntries).set({ data: foreignPage }).where(eq(contentEntries.id, rootId));
      assert.equal(mark(await read(), 0).href, null);
      await db.update(contentEntries).set({ data }).where(eq(contentEntries.id, rootId));
    });

    await t.test("self links resolve without recursion and deleted pages do not leak stale paths", async () => {
      const self = { slug: "source", body: document([{ kind: "page", entryId: rootId }]) };
      await validateEntryDataForPublish(db, tenantId, modelId, self, rootId);
      await db.update(contentEntries).set({ data: self }).where(eq(contentEntries.id, rootId));
      assert.equal(mark(await read(), 0).href, "/nl/source");
      await db.update(contentEntries).set({ data }).where(eq(contentEntries.id, rootId));
      await db.update(contentEntries).set({ deletedAt: new Date() }).where(eq(contentEntries.id, targetId));
      assert.equal(mark(await read(), 0).href, null);
      await assert.rejects(validateEntryDataForPublish(db, tenantId, modelId, data, rootId), /page link is unavailable/);
      await db.update(contentEntries).set({ deletedAt: null }).where(eq(contentEntries.id, targetId));
    });

    await t.test("download endpoint checks its capability, and deleting a file revokes access", async () => {
      const url = new URL((await getDeliveryAsset(tenantId, assetId)).downloadUrl);
      const token = url.pathname.split("/").at(-1);
      const request = new Request(url, { method: "HEAD" });
      const response = await download(request, { params: Promise.resolve({ tenantId, assetId, token }) });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "private, no-cache, must-revalidate");
      assert.equal(response.headers.get("content-length"), "123");
      assert.equal(response.headers.get("location"), null);
      assert.equal((await download(request, { params: Promise.resolve({ tenantId, assetId, token: "invalid" }) })).status, 404);
      assert.equal((await download(request, { params: Promise.resolve({ tenantId: otherTenantId, assetId, token }) })).status, 404);
      await db.update(assets).set({ deletedAt: new Date(), status: "deleted" }).where(eq(assets.id, assetId));
      assert.equal((await download(request, { params: Promise.resolve({ tenantId, assetId, token }) })).status, 404);
      assert.equal(mark(await read(), 1).href, null);
      await assert.rejects(validateEntryDataForPublish(db, tenantId, modelId, data, rootId), /asset link is unavailable/);
    });
  } finally {
    await db.delete(contentEntries).where(inArray(contentEntries.tenantId, [tenantId, otherTenantId]));
    await db.delete(contentModelFields).where(inArray(contentModelFields.tenantId, [tenantId, otherTenantId]));
    await db.delete(contentModels).where(inArray(contentModels.tenantId, [tenantId, otherTenantId]));
    await db.delete(tenants).where(inArray(tenants.id, [tenantId, otherTenantId]));
    await globalThis.cmsPool?.end();
    globalThis.cmsS3Client?.destroy();
  }
});
