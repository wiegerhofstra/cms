import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import nextEnv from "@next/env";
import pg from "pg";
import { setupModels } from "./setup.mjs";
import { sourceTables } from "./source.mjs";
import { buildContentPlan } from "./content.mjs";
import { readDestination, validatePlan, writePlan, assertUnchangedSnapshot } from "./destination.mjs";

nextEnv.loadEnvConfig(process.cwd());
test("content import merges safely, preserves dates, maps joins and blocks, and is idempotent", async () => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    const slug = `content_import_test_${randomUUID()}`;
    await client.query("insert into tenants (slug,name) values ($1,'Content import test')", [slug]);
    await setupModels(client, slug);
    let before = await readDestination(client, slug);
    const staffModel = before.models.find((m) => m.slug === "employee");
    const { rows: [existing] } = await client.query(`insert into content_entries (tenant_id,model_id,status,data)
      values ($1,$2,'published',$3) returning *`, [before.tenant.id, staffModel.id, { firstname: "Jane", email: "jane@example.invalid", big: 123456789 }]);
    before = await readDestination(client, slug);
    const dates = { created_at: "2020-01-01T08:00:00.000Z", updated_at: "2024-01-02T09:30:00.000Z" };
    const source = Object.fromEntries(sourceTables.map((table) => [table, []]));
    source.users = [{ id: "1", name: "Public author" }];
    source.admin_humans = [{ ...dates, id: "1", firstname: "Jane", surname: "Doe", email: "jane@example.invalid", big: "123456789", supportstaff: false, content: "Biography" }];
    source.admin_locations = [{ ...dates, id: "2", title: "Clinic", slug: "clinic", o_mo_open: "09:05:00", o_mo_close: "17:30:00" }];
    source.admin_loc_human_links = [{ id: "1", location_id: 2, human_id: 1, order_id: 2 }, { id: "2", location_id: 2, human_id: 999, order_id: 1 }];
    source.admin_pages = [{ ...dates, id: "3", title: "Training", slug: "training", template_id: 7, published: false, homepage: false, content: "<p>Introduction</p>" }];
    source.admin_menus = [{ ...dates, id: "4", title: "Training", mtype: 0, value: 3, root_id: 0, order_id: 1 }];
    source.admin_blogs = [{ ...dates, id: "5", title: "Future news", content: "Later", published: true, pdate: "2030-01-01", user_id: 1 }];
    const originalSource = structuredClone(source);
    const plan = buildContentPlan(source, before.tenant, before.models, before.entries, [], "2026-09-27");
    validatePlan(plan, before, []);
    assert.deepEqual(source, originalSource);
    assert.equal(plan.entries.find((e) => e.slug === "employee").id, existing.id);
    assert.equal(plan.entries.find((e) => e.slug === "blog").status, "draft");
    assert.equal(plan.entries.find((e) => e.slug === "page").status, "published");
    assert.equal(plan.warnings.length, 1);
    const location = plan.entries.find((e) => e.slug === "location");
    assert.equal(location.data.o_mo_open, "09:05");
    assert.deepEqual(location.data.employees, [{ childEntryId: existing.id }]);
    assert.deepEqual(plan.entries.find((e) => e.slug === "page").data.content.map((ref) => plan.entries.find((e) => e.id === ref.childEntryId).slug), ["text_content", "trainings_block"]);
    const result = await writePlan(client, plan, before, []);
    assert.equal(result.filled, 1);
    const after = await readDestination(client, slug);
    assert.equal(after.entries.find((e) => e.id === location.id).created_at.toISOString(), dates.created_at);
    const updated = after.entries.find((e) => e.id === existing.id);
    for (const [key, value] of Object.entries(existing.data)) assert.deepEqual(updated.data[key], value);
    assert.equal((await client.query("select count(*)::int as n from entry_revisions where entry_id=$1", [existing.id])).rows[0].n, 2);
    const second = buildContentPlan(source, after.tenant, after.models, after.entries, [], "2026-09-27");
    validatePlan(second, after, []);
    assert.ok(second.entries.every((e) => e.action === "reuse"));
    assert.deepEqual(await writePlan(client, second, after, []), { created: 0, filled: 0, reused: second.entries.length, assetsCreated: 0, assetsReused: 0 });
    source.admin_humans[0].firstname = "Conflicting edit";
    assert.throws(() => buildContentPlan(source, after.tenant, after.models, after.entries, [], "2026-09-27"), /Existing content differs/);
    assert.throws(() => assertUnchangedSnapshot(after, before), /Destination changed/);
  } finally {
    await client.query("rollback");
    await client.end();
  }
});
