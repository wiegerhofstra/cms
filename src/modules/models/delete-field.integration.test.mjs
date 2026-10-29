import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import nextEnv from "@next/env";
import { eq, inArray } from "drizzle-orm";

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

test("field deletion preserves content and enforces model and tenant boundaries", async (t) => {
  const { db } = await import("../../db/index.ts");
  const { tenants, contentModels, contentModelFields, contentModelFieldTargets, contentEntries, entryRevisions } = await import("../../db/schema/index.ts");
  const { deleteModelField } = await import("./delete-field.ts");
  const tenantId = crypto.randomUUID(), otherTenantId = crypto.randomUUID();
  const modelId = crypto.randomUUID(), componentId = crypto.randomUUID(), foreignModelId = crypto.randomUUID();
  const linkId = crypto.randomUUID(), slugId = crypto.randomUUID(), foreignFieldId = crypto.randomUUID();
  const parentId = crypto.randomUUID(), childId = crypto.randomUUID();
  const data = { slug: "service", link: childId };
  const translations = { nl: { slug: "dienst", link: childId } };
  const conflict = (error) => error.code === "CONFLICT";
  const notFound = (error) => error.code === "NOT_FOUND";
  try {
    await db.insert(tenants).values([tenantId, otherTenantId].map((id) => ({ id, name: "Field deletion test", slug: `field-test-${id}` })));
    await db.insert(contentModels).values([
      { id: modelId, tenantId, name: "Service", slug: "service", pageUrl: { pattern: "/{slug}", slugField: "slug" } },
      { id: componentId, tenantId, name: "Link", slug: "link", kind: "block" },
      { id: foreignModelId, tenantId: otherTenantId, name: "Service", slug: "service" },
    ]);
    await db.insert(contentModelFields).values([
      { id: linkId, tenantId, modelId, key: "link", label: "Link", type: "component", position: 0 },
      { id: slugId, tenantId, modelId, key: "slug", label: "Slug", type: "slug", required: true, config: { unique: true }, position: 1 },
      { id: foreignFieldId, tenantId: otherTenantId, modelId: foreignModelId, key: "link", label: "Link", type: "text", position: 0 },
    ]);
    await db.insert(contentModelFieldTargets).values({ fieldId: linkId, targetModelId: componentId });
    await db.insert(contentEntries).values([
      { id: parentId, tenantId, modelId, status: "published", data, translations },
      { id: childId, tenantId, modelId: componentId, parentEntryId: parentId, parentFieldId: linkId, data: { url: "https://example.com" } },
      { tenantId, modelId, data: { link: null }, deletedAt: new Date() },
    ]);
    await db.insert(entryRevisions).values({ tenantId, entryId: parentId, version: 1, data, translations });

    await t.test("cannot delete another tenant's or model's field", async () => {
      await assert.rejects(deleteModelField(db, tenantId, foreignModelId, foreignFieldId), notFound);
      await assert.rejects(deleteModelField(db, tenantId, modelId, foreignFieldId), notFound);
      await assert.rejects(deleteModelField(db, tenantId, componentId, linkId), notFound);
      assert.equal((await db.select().from(contentModelFields).where(eq(contentModelFields.id, foreignFieldId))).length, 1);
    });
    await t.test("page URL slug fields and archived models stay protected", async () => {
      await assert.rejects(deleteModelField(db, tenantId, modelId, slugId), conflict);
      await db.update(contentModels).set({ status: "archived" }).where(eq(contentModels.id, modelId));
      await assert.rejects(deleteModelField(db, tenantId, modelId, linkId), conflict);
      await db.update(contentModels).set({ status: "active" }).where(eq(contentModels.id, modelId));
      assert.equal((await db.select().from(contentModelFields).where(eq(contentModelFields.id, slugId))).length, 1);
    });
    await t.test("deletes a populated component field without losing entries, translations or revisions", async () => {
      const before = await db.select().from(contentEntries).where(eq(contentEntries.modelId, modelId));
      assert.deepEqual(await deleteModelField(db, tenantId, modelId, linkId), { deleted: true });
      assert.equal((await db.select().from(contentModelFields).where(eq(contentModelFields.id, linkId))).length, 0);
      assert.equal((await db.select().from(contentModelFieldTargets).where(eq(contentModelFieldTargets.fieldId, linkId))).length, 0);
      const after = await db.select().from(contentEntries).where(eq(contentEntries.modelId, modelId));
      assert.deepEqual(after.sort((a, b) => a.id.localeCompare(b.id)), before.sort((a, b) => a.id.localeCompare(b.id)));
      const [child] = await db.select().from(contentEntries).where(eq(contentEntries.id, childId));
      assert.deepEqual(child.data, { url: "https://example.com" });
      assert.equal(child.parentEntryId, parentId);
      assert.equal(child.parentFieldId, null);
      const [revision] = await db.select().from(entryRevisions).where(eq(entryRevisions.entryId, parentId));
      assert.deepEqual(revision.data, data);
      assert.deepEqual(revision.translations, translations);
      await assert.rejects(deleteModelField(db, tenantId, modelId, linkId), notFound);
    });
  } finally {
    await db.delete(contentEntries).where(inArray(contentEntries.tenantId, [tenantId, otherTenantId]));
    await db.delete(contentModelFields).where(inArray(contentModelFields.tenantId, [tenantId, otherTenantId]));
    await db.delete(contentModels).where(inArray(contentModels.tenantId, [tenantId, otherTenantId]));
    await db.delete(tenants).where(inArray(tenants.id, [tenantId, otherTenantId]));
    await globalThis.cmsPool?.end();
  }
});
