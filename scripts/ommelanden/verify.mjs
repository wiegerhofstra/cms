import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import nextEnv from "@next/env";
import pg from "pg";
import { checksum } from "./media.mjs";
import { readSource } from "./source.mjs";
import { readDestination } from "./destination.mjs";
import { buildContentPlan } from "./content.mjs";

// Run the real server-side validation/delivery services without creating tokens
// or changing authentication. Resolve the application's TS paths for Node.
const src = path.resolve("src");
registerHooks({ resolve(specifier, context, nextResolve) {
  const candidate = specifier.startsWith("@/") ? path.join(src, specifier.slice(2)) :
    specifier.startsWith(".") && context.parentURL?.startsWith(pathToFileURL(`${src}/`).href)
      ? fileURLToPath(new URL(specifier, context.parentURL)) : null;
  if (candidate) for (const filename of [candidate, `${candidate}.ts`, path.join(candidate, "index.ts")]) {
    if (filename.endsWith(".ts") && existsSync(filename)) return { url: pathToFileURL(filename).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
} });

const directory = process.argv[2];
if (!directory) throw new Error("Pass the completed import report directory");
nextEnv.loadEnvConfig(process.cwd());
const read = async (name) => JSON.parse(await readFile(path.join(directory, name), "utf8"));
const [before, plan, media, report] = await Promise.all([read("destination-before.json"), read("plan.json"), read("media.json"), read("report.json")]);
assert.equal(report.committed, true, "Expected a committed import");
const target = new pg.Client({ connectionString: process.env.DATABASE_URL });
await target.connect();
try {
  const after = await readDestination(target);
  assert.deepEqual(JSON.parse(JSON.stringify(after.models)), before.models, "Models changed");
  for (const original of before.entries) {
    const current = after.entries.find((e) => e.id === original.id);
    assert.ok(current, `Missing existing entry ${original.id}`);
    for (const [key, value] of Object.entries(original.data)) assert.deepEqual(current.data[key], value, `Existing value changed: ${original.id}.${key}`);
    for (const key of ["status", "parent_entry_id", "parent_field_id", "position", "created_by", "updated_by"]) assert.deepEqual(current[key], original[key]);
    for (const key of ["created_at", "published_at", "deleted_at"]) assert.equal(current[key]?.toISOString() ?? null, original[key]);
  }
  for (const original of before.assets) assert.deepEqual(JSON.parse(JSON.stringify(after.assets.find((a) => a.id === original.id))), original, "Existing asset changed");
  const otherBefore = JSON.parse(await readFile(path.resolve(".env.ommelanden-content/other-tenants-before.json"), "utf8"));
  for (const [table, hash] of Object.entries(otherBefore)) {
    if (!["content_models", "content_model_fields", "content_entries", "assets", "entry_revisions"].includes(table)) throw new Error("Unexpected snapshot table");
    const rows = (await target.query(`select * from ${table} where tenant_id<>$1 order by id`, [before.tenant.id])).rows;
    assert.equal(checksum(JSON.stringify(rows)), hash, `Other tenants changed: ${table}`);
  }
  const source = await readSource(process.env.OMMELANDEN_DATABASE_CONFIG ?? path.resolve("../ommelanden/config/database.yml"));
  assert.equal(checksum(JSON.stringify(source)), report.sourceSha256, "Source content changed since the import");
  for (const asset of media) assert.equal(checksum(await readFile(asset.filename)), asset.sha256, `Source file changed: ${asset.uid}`);
  const second = buildContentPlan(source, after.tenant, after.models, after.entries, media, new Date().toISOString().slice(0, 10));
  assert.ok(second.entries.every((e) => e.action === "reuse"), "Rerun would change content");

  const { db } = await import("../../src/db/index.ts");
  const { validateEntryForPublish } = await import("../../src/modules/entries/service.ts");
  const { getPublishedEntry, listPublishedEntries } = await import("../../src/modules/content-delivery/service.ts");
  let checked = 0;
  for (const entry of plan.entries) {
    if (entry.status !== "published") continue;
    await validateEntryForPublish(db, before.tenant.id, entry.id);
    const delivered = await getPublishedEntry({ tenantId: before.tenant.id, modelSlug: entry.slug, entryId: entry.id, maxDepth: 2 });
    assert.equal(delivered.id, entry.id);
    for (const field of before.models.find((m) => m.slug === entry.slug).fields) {
      const value = entry.data[field.key];
      if (field.type === "asset" && value) assert.equal(delivered.data[field.key]?.id, value, `Asset missing from delivery: ${entry.key}`);
      if (field.type === "component" && Array.isArray(value)) assert.equal(delivered.data[field.key]?.length, value.length, `References dropped: ${entry.key}`);
    }
    if (++checked % 25 === 0) console.log(`Validated and delivered ${checked}/${plan.entries.length} entries`);
  }
  // Use small pages because delivery has a bounded rich-text expansion budget.
  for (const modelSlug of Object.keys(plan.sourceCounts)) {
    const result = await listPublishedEntries({ tenantId: before.tenant.id, modelSlug, limit: 1, cursor: null, maxDepth: 1 });
    assert.ok(result.entries.length > 0, `Empty imported collection: ${modelSlug}`);
  }
  const verification = { publishedEntriesChecked: checked, sourceDatabaseUnchanged: true, sourceMediaUnchanged: media.length,
    existingContentPreserved: before.entries.length, existingAssetsPreserved: before.assets.length, otherTenantsUnchanged: true, rerunHasNoChanges: true };
  await writeFile(path.join(directory, "verification.json"), JSON.stringify(verification, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(verification, null, 2));
} finally {
  await target.end();
  await globalThis.cmsPool?.end();
  globalThis.cmsS3Client?.destroy();
}
