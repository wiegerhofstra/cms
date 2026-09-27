import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import nextEnv from "@next/env";
import pg from "pg";
import { setupModels } from "./setup.mjs";
import { models, pageTemplates } from "./models.mjs";

nextEnv.loadEnvConfig(process.cwd());

// Real PostgreSQL constraints and references; every test write is rolled back.
test("model setup preserves entries, is tenant-scoped and idempotent, and rolls back conflicts", async () => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    const slug = `migration_test_${randomUUID()}`;
    const { rows: [tenant] } = await client.query("insert into tenants (slug,name) values ($1,'Migration test') returning id", [slug]);
    const { rows: [other] } = await client.query("insert into tenants (slug,name) values ($1,'Isolation test') returning id", [`other_${slug}`]);
    const { rows: [otherModel] } = await client.query("insert into content_models (tenant_id,name,slug) values ($1,'Other employee','employee') returning *", [other.id]);
    const { rows: [employee] } = await client.query("insert into content_models (tenant_id,name,slug) values ($1,'Custom staff label','employee') returning id", [tenant.id]);
    await client.query(`insert into content_model_fields (tenant_id,model_id,key,label,type,required,position)
      values ($1,$2,'big','Registration','number',false,0), ($1,$2,'email','Email','text',true,1),
      ($1,$2,'custom','Custom field','text',false,2)`, [tenant.id, employee.id]);
    const { rows: [entry] } = await client.query("insert into content_entries (tenant_id,model_id,data) values ($1,$2,$3) returning *",
      [tenant.id, employee.id, { big: 123456789, custom: "keep me" }]);

    assert.ok((await setupModels(client, slug)).length > 0);
    assert.deepEqual(await setupModels(client, slug), []);
    const { rows: actualModels } = await client.query("select * from content_models where tenant_id=$1", [tenant.id]);
    assert.equal(actualModels.length, models.length);
    assert.equal(actualModels.find((m) => m.slug === "employee").name, "Custom staff label");
    assert.deepEqual((await client.query("select * from content_entries where id=$1", [entry.id])).rows[0], entry);
    assert.deepEqual((await client.query("select * from content_models where id=$1", [otherModel.id])).rows[0], otherModel);
    assert.equal((await client.query("select count(*)::int as n from content_model_fields where tenant_id=$1", [other.id])).rows[0].n, 0);
    const { rows: fields } = await client.query(`select m.slug,f.* from content_model_fields f join content_models m on m.id=f.model_id where f.tenant_id=$1`, [tenant.id]);
    assert.equal(fields.find((f) => f.slug === "employee" && f.key === "big").type, "text");
    assert.equal(fields.find((f) => f.slug === "employee" && f.key === "email").required, false);
    assert.equal(fields.filter((f) => f.slug === "location" && f.type === "time").length, 14);
    const template = fields.find((f) => f.slug === "page" && f.key === "template");
    assert.deepEqual(template.config.options, pageTemplates);
    const { rows: targets } = await client.query(`select f.id,m.slug,m.tenant_id from content_model_field_targets t
      join content_model_fields f on f.id=t.field_id join content_models m on m.id=t.target_model_id where f.tenant_id=$1`, [tenant.id]);
    for (const field of fields.filter((f) => f.type === "component")) {
      assert.deepEqual(targets.filter((t) => t.id === field.id).map((t) => t.slug).sort(), [...field.config.targetModelSlugs].sort());
    }
    assert.ok(targets.every((t) => t.tenant_id === tenant.id));

    // Existing enum customizations survive while missing legacy options are added.
    const customOptions = [{ label: "Custom", value: "custom" }, { label: "My content", value: "content" }];
    await client.query("update content_model_fields set config=$1 where id=$2", [{ options: customOptions, custom: true }, template.id]);
    await setupModels(client, slug);
    const merged = (await client.query("select config from content_model_fields where id=$1", [template.id])).rows[0].config;
    assert.equal(merged.custom, true);
    assert.deepEqual(merged.options.slice(0, 2), customOptions);
    assert.equal(merged.options.length, 14);
    assert.deepEqual(await setupModels(client, slug), []);

    await client.query("savepoint incompatible");
    await client.query("update content_model_fields set type='number' where id=$1", [template.id]);
    await assert.rejects(setupModels(client, slug), /Incompatible existing field page.template/);
    await client.query("rollback to savepoint incompatible");
    assert.deepEqual(await setupModels(client, slug), []);
    await assert.rejects(setupModels(client, `missing_${slug}`), /does not exist/);
  } finally {
    await client.query("rollback");
    await client.end();
  }
});
