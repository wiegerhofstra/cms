import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { isDeepStrictEqual } from "node:util";
import { isValidTimeValue } from "../../src/modules/entries/time.ts";
import { plainText } from "./html.mjs";

const richSchema = getSchema([StarterKit, TableKit]);
export async function readDestination(client, tenantSlug = "ommelanden") {
  const { rows: [tenant] } = await client.query("select * from tenants where slug=$1", [tenantSlug]);
  if (!tenant) throw new Error("Ommelanden tenant does not exist");
  const { rows: models } = await client.query(`select m.*, coalesce((select json_agg(f order by f.position,f.id)
    from content_model_fields f where f.model_id=m.id and f.tenant_id=m.tenant_id),'[]') as fields
    from content_models m where m.tenant_id=$1 order by m.id`, [tenant.id]);
  const { rows: entries } = await client.query("select * from content_entries where tenant_id=$1 order by id", [tenant.id]);
  const { rows: assets } = await client.query("select * from assets where tenant_id=$1 order by id", [tenant.id]);
  const { rows: targets } = await client.query(`select t.* from content_model_field_targets t join content_model_fields f on f.id=t.field_id where f.tenant_id=$1 order by t.field_id,t.target_model_id`, [tenant.id]);
  return { tenant, models, entries, assets, targets };
}

export function validatePlan(plan, destination, media) {
  const entries = new Map(destination.entries.filter((e) => !e.deleted_at).map((e) => [e.id, { ...e, modelId: e.model_id }]));
  for (const entry of plan.entries) entries.set(entry.id, entry);
  const assetIds = new Set([...destination.assets.filter((a) => a.status === "ready" && !a.deleted_at).map((a) => a.id), ...media.map((a) => a.id)]);
  for (const entry of plan.entries) {
    const model = destination.models.find((m) => m.id === entry.modelId);
    for (const key of Object.keys(entry.data)) if (!model.fields.some((f) => f.key === key)) throw new Error(`Unmodelled field: ${entry.slug}.${key}`);
    for (const field of model.fields) {
      const value = entry.data[field.key];
      const empty = value === undefined || value === null || value === "" ||
        (Array.isArray(value) && !value.length) || (field.type === "rich_text" && !plainText(value).trim());
      if (empty) {
        if (field.required && entry.status === "published") throw new Error(`Required field missing: ${entry.key}.${field.key}`);
        continue;
      }
      if (field.type === "component") {
        if (field.is_list && !Array.isArray(value)) throw new Error(`Expected list: ${entry.key}.${field.key}`);
        if (!field.is_list && Array.isArray(value)) throw new Error(`Expected single reference: ${entry.key}.${field.key}`);
        const targets = destination.targets.filter((t) => t.field_id === field.id).map((t) => t.target_model_id);
        for (const reference of field.is_list ? value : [value]) {
          const child = entries.get(reference.childEntryId);
          if (!child || !targets.includes(child.modelId)) throw new Error(`Invalid reference: ${entry.key}.${field.key}`);
          if (entry.status === "published" && child.status !== "published") throw new Error(`Published entry references draft: ${entry.key}.${field.key}`);
        }
      } else if (field.type === "rich_text") {
        richSchema.nodeFromJSON(value).check();
      } else if (field.type === "asset") {
        if (!assetIds.has(value)) throw new Error(`Missing asset: ${entry.key}.${field.key}`);
      } else if (field.type === "time") {
        if (!isValidTimeValue(value)) throw new Error(`Invalid time: ${entry.key}.${field.key}`);
      } else if (field.type === "slug") {
        if (typeof value !== "string" || !/^[a-z0-9_-]+$/.test(value)) throw new Error(`Invalid slug: ${entry.key}.${field.key}`);
        if (field.config.unique && [...entries.values()].some((e) => e.id !== entry.id && e.modelId === model.id && e.data[field.key] === value)) {
          throw new Error(`Duplicate slug: ${entry.slug}/${value}`);
        }
      } else if (field.type === "enum") {
        if (!field.config.options.some((option) => (typeof option === "string" ? option : option.value) === value)) throw new Error(`Invalid enum: ${entry.key}.${field.key}`);
      } else if (field.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) throw new Error(`Invalid number: ${entry.key}.${field.key}`);
      else if (field.type === "boolean" && typeof value !== "boolean") throw new Error(`Invalid boolean: ${entry.key}.${field.key}`);
      else if (field.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid date: ${entry.key}.${field.key}`);
    }
  }
  for (const asset of media) {
    const existing = destination.assets.find((a) => a.id === asset.id || a.object_key === asset.objectKey);
    if (existing && (existing.id !== asset.id || existing.deleted_at || existing.status !== "ready" ||
      existing.bucket !== asset.bucket || existing.object_key !== asset.objectKey || Number(existing.size_bytes) !== asset.sizeBytes || existing.mime_type !== asset.mimeType)) {
      throw new Error(`Existing media record conflicts: ${asset.uid}`);
    }
  }
}

export async function writePlan(client, plan, before, media) {
  const tenantId = before.tenant.id;
  const counts = { created: 0, filled: 0, reused: 0, assetsCreated: 0, assetsReused: 0 };
  for (const asset of media) {
    if (before.assets.some((a) => a.id === asset.id)) { counts.assetsReused++; continue; }
    await client.query(`insert into assets (id,tenant_id,bucket,object_key,original_name,mime_type,size_bytes,image_width,image_height,etag,status)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ready')`,
    [asset.id, tenantId, asset.bucket, asset.objectKey, asset.originalName, asset.mimeType, asset.sizeBytes, asset.imageWidth, asset.imageHeight, asset.etag ?? null]);
    counts.assetsCreated++;
  }
  for (const entry of plan.entries) {
    if (entry.action === "reuse") { counts.reused++; continue; }
    let version = 1;
    if (entry.action === "fill_missing") {
      const previous = before.entries.find((e) => e.id === entry.id);
      version = (await client.query("select coalesce(max(version),0)::int+1 as next from entry_revisions where entry_id=$1 and tenant_id=$2", [entry.id, tenantId])).rows[0].next;
      await client.query("insert into entry_revisions (tenant_id,entry_id,version,data) values ($1,$2,$3,$4)", [tenantId, entry.id, version++, previous.data]);
      await client.query("update content_entries set data=$1,updated_at=now() where id=$2 and tenant_id=$3", [entry.data, entry.id, tenantId]);
      counts.filled++;
    } else {
      await client.query(`insert into content_entries (id,tenant_id,model_id,status,data,published_at,created_at,updated_at,parent_entry_id,parent_field_id,position)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [entry.id, tenantId, entry.modelId, entry.status, entry.data, entry.publishedAt, entry.createdAt, entry.updatedAt, entry.parentEntryId, entry.parentFieldId, entry.position]);
      counts.created++;
    }
    await client.query("insert into entry_revisions (tenant_id,entry_id,version,data) values ($1,$2,$3,$4)", [tenantId, entry.id, version, entry.data]);
  }
  return counts;
}

export function assertUnchangedSnapshot(actual, expected) {
  if (!isDeepStrictEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)))) {
    throw new Error("Destination changed since planning. No database changes committed; rerun to review a fresh plan.");
  }
}
