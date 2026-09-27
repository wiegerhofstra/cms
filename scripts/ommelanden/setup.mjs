import { isDeepStrictEqual } from "node:util";
import { models, pageTemplates } from "./models.mjs";
import { createModelSchema } from "../../src/modules/models/validation.ts";

// Caller owns the transaction. No entries, revisions, assets or accounts are written.
export async function setupModels(client, tenantSlug = "ommelanden") {
  const definitions = models.map((model) => createModelSchema.parse(model));
  const { rows: [tenant] } = await client.query("select id from tenants where slug=$1 for update", [tenantSlug]);
  if (!tenant) throw new Error(`Tenant ${tenantSlug} does not exist`);
  const changes = [];
  const modelIds = new Map();

  // Create every model first: group and menu_item can reference themselves.
  for (const definition of definitions) {
    let { rows: [model] } = await client.query(
      "select id, status from content_models where tenant_id=$1 and slug=$2 for update", [tenant.id, definition.slug],
    );
    if (!model) {
      ({ rows: [model] } = await client.query(
        "insert into content_models (tenant_id,name,slug) values ($1,$2,$3) returning id,status",
        [tenant.id, definition.name, definition.slug],
      ));
      changes.push(`Create model ${definition.slug}`);
    }
    if (model.status !== "active") throw new Error(`Model ${definition.slug} is archived; resolve before setup`);
    modelIds.set(definition.slug, model.id);
  }

  for (const definition of definitions) {
    const modelId = modelIds.get(definition.slug);
    const { rows: existing } = await client.query(
      "select * from content_model_fields where tenant_id=$1 and model_id=$2 order by position for update",
      [tenant.id, modelId],
    );
    let position = Math.max(-1, ...existing.map((f) => f.position)) + 1;
    let hasTitle = existing.some((f) => f.is_title);
    const start = changes.length;

    for (const field of definition.fields) {
      let current = existing.find((f) => f.key === field.key);
      const isList = field.type === "component" && field.config.isList === true;
      if (!current) {
        const isTitle = field.isTitle && !hasTitle;
        ({ rows: [current] } = await client.query(
          `insert into content_model_fields (tenant_id,model_id,key,label,type,required,position,config,is_list,is_title)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
          [tenant.id, modelId, field.key, field.label, field.type, field.required, position++, field.config, isList, isTitle],
        ));
        hasTitle ||= isTitle;
        changes.push(`Add ${definition.slug}.${field.key}`);
      }

      // The one intentional type correction. Historical JSON is retained; the
      // editor already displays numeric values in text fields via stringValue().
      if (definition.slug === "employee" && field.key === "big" && current.type === "number") {
        await client.query("update content_model_fields set type='text',updated_at=now() where id=$1 and tenant_id=$2", [current.id, tenant.id]);
        current.type = "text";
        changes.push("Change employee.big from number to text");
      }
      if (current.type !== field.type || current.is_list !== isList) {
        throw new Error(`Incompatible existing field ${definition.slug}.${field.key}; no changes committed`);
      }

      // Old records may have no email or location_name. Do not invent values.
      if (((definition.slug === "employee" && field.key === "email") ||
           (definition.slug === "location" && field.key === "name")) && current.required) {
        await client.query("update content_model_fields set required=false,updated_at=now() where id=$1 and tenant_id=$2", [current.id, tenant.id]);
        changes.push(`Make ${definition.slug}.${field.key} optional`);
      }

      if (definition.slug === "page" && field.key === "template") {
        const options = current.config.options;
        if (!Array.isArray(options) || options.some((o) => !o || typeof o.value !== "string")) {
          throw new Error("page.template has an unsupported options format");
        }
        const merged = [...options, ...pageTemplates.filter((o) => !options.some((old) => old.value === o.value))];
        if (!isDeepStrictEqual(options, merged)) {
          await client.query("update content_model_fields set config=$1,updated_at=now() where id=$2 and tenant_id=$3",
            [{ ...current.config, options: merged }, current.id, tenant.id]);
          changes.push("Add missing legacy page templates");
        }
      }

      if (field.type === "component") {
        // Preserve additional editor-configured targets. Add missing migration targets.
        const configured = current.config.targetModelSlugs ?? (current.config.targetModelSlug ? [current.config.targetModelSlug] : []);
        if (!Array.isArray(configured) || configured.some((s) => typeof s !== "string")) {
          throw new Error(`Invalid component targets on ${definition.slug}.${field.key}`);
        }
        const { rows: linked } = await client.query(
          `select m.slug,m.tenant_id from content_model_field_targets t join content_models m on m.id=t.target_model_id where t.field_id=$1`, [current.id],
        );
        if (linked.some((m) => m.tenant_id !== tenant.id)) throw new Error("Cross-tenant component target found");
        const slugs = [...new Set([...configured, ...linked.map((m) => m.slug), ...field.config.targetModelSlugs])];
        const config = { ...current.config, targetModelSlugs: slugs, isList };
        delete config.targetModelSlug;
        if (!isDeepStrictEqual(current.config, config)) {
          await client.query("update content_model_fields set config=$1,updated_at=now() where id=$2 and tenant_id=$3", [config, current.id, tenant.id]);
          changes.push(`Extend targets for ${definition.slug}.${field.key}`);
        }
        for (const targetSlug of slugs) {
          const { rows: [target] } = await client.query("select id from content_models where tenant_id=$1 and slug=$2", [tenant.id, targetSlug]);
          if (!target) throw new Error(`Missing target model ${targetSlug}`);
          const result = await client.query(
            "insert into content_model_field_targets (field_id,target_model_id) values ($1,$2) on conflict do nothing", [current.id, target.id],
          );
          if (result.rowCount) changes.push(`Link ${definition.slug}.${field.key} to ${targetSlug}`);
        }
      }
    }
    if (changes.length > start) await client.query("update content_models set updated_at=now() where tenant_id=$1 and id=$2", [tenant.id, modelId]);
  }
  return changes;
}
