import { isDeepStrictEqual } from "node:util";
import { pageTemplates } from "./models.mjs";
import { toRichText, plainText } from "./html.mjs";
import { stableId } from "./media.mjs";

export const contentSources = {
  employee: "admin_humans", experience: "admin_experiences", location: "admin_locations",
  specialty: "admin_specialties", training: "admin_trainings", issue: "admin_issues",
  group: "admin_groups", blog: "admin_blogs", page: "admin_pages", menu_item: "admin_menus",
};
const normal = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const slugify = (value) => String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const reference = (childEntryId) => ({ childEntryId });
const order = (a, b) => (a.order_id ?? Infinity) - (b.order_id ?? Infinity) || Number(a.id) - Number(b.id);
const present = (value) => value !== undefined && value !== null && value !== "";
const numeric = (value) => {
  if (!present(value)) return null;
  if (!Number.isFinite(Number(value))) throw new Error(`Invalid number: ${value}`);
  return Number(value);
};

export function buildContentPlan(source, tenant, models, existing, assets, today) {
  const bySlug = new Map(models.map((m) => [m.slug, m]));
  const byId = new Map(models.map((m) => [m.id, m.slug]));
  const assetIds = new Map(assets.map((a) => [a.uid, a.id]));
  const ids = new Map();
  const matched = new Map();
  const warnings = [];
  const entries = [];
  const routes = [];
  const media = (uid) => {
    if (!uid) return null;
    if (!assetIds.has(uid)) throw new Error(`Missing Dragonfly asset: ${uid}`);
    return assetIds.get(uid);
  };
  const model = (slug) => {
    const found = bySlug.get(slug);
    if (!found || found.status !== "active") throw new Error(`Missing active model: ${slug}`);
    return found;
  };

  // Resolve every identity before mapping references. A match must be unique.
  for (const [slug, table] of Object.entries(contentSources)) {
    const modelId = model(slug).id;
    for (const row of source[table]) {
      const key = `${table}:${row.id}`;
      const deterministic = stableId(tenant.id, key);
      let candidates = existing.filter((e) => e.model_id === modelId && (e.id === deterministic || String(e.data.legacy_id) === String(row.id)));
      if (!candidates.length) candidates = existing.filter((e) => {
        if (e.model_id !== modelId || e.deleted_at || present(e.data.legacy_id)) return false;
        if (row.slug && e.data.slug === row.slug) return true;
        if (slug === "employee") return row.email && row.email === e.data.email;
        if (slug === "experience") return row.name === e.data.name && row.location === e.data.locatie;
        return false;
      });
      if (candidates.length > 1 || candidates.some((e) => e.deleted_at)) throw new Error(`Ambiguous or deleted target for ${key}`);
      const current = candidates[0];
      const id = current?.id ?? deterministic;
      if ([...ids.values()].includes(id)) throw new Error(`Two source records resolve to one entry: ${key}`);
      ids.set(key, id);
      if (current) matched.set(id, current);
    }
  }
  const targetId = (table, id) => ids.get(`${table}:${id}`);
  const links = (table, parentColumn, parentId, targetTable, targetColumn) => source[table]
    .filter((r) => String(r[parentColumn]) === String(parentId)).sort(order).flatMap((r) => {
      const id = targetId(targetTable, r[targetColumn]);
      if (!id) { warnings.push({ kind: "orphan_reference", table, id: r.id, missing: `${targetTable}:${r[targetColumn]}` }); return []; }
      return [reference(id)];
    });

  function add(slug, key, row, data, status = "published", owner = null) {
    const id = ids.get(key) ?? stableId(tenant.id, key);
    const current = matched.get(id) ?? existing.find((e) => e.id === id);
    if (current && (current.model_id !== model(slug).id || current.deleted_at)) throw new Error(`Incompatible target for ${key}`);
    const desired = JSON.parse(JSON.stringify(data));
    if (current) {
      // Preserve populated editor values; accept equivalent rich text/whitespace.
      // Material conflicts abort before any destination write.
      for (const [field, value] of Object.entries(desired)) {
        const old = current.data[field];
        if (!present(old)) continue;
        const same = isDeepStrictEqual(old, value) ||
          (typeof old === "number" && typeof value === "string" && String(old) === value) ||
          (typeof old === "string" && typeof value === "string" && normal(old) === normal(value)) ||
          (old?.type === "doc" && value?.type === "doc" && normal(plainText(old)) === normal(plainText(value)));
        if (!same) throw new Error(`Existing content differs: ${slug} (${key}) field ${field}`);
        desired[field] = old;
      }
      Object.assign(desired, Object.fromEntries(Object.entries(current.data).filter(([field]) => !(field in desired))));
      if (current.status !== status) throw new Error(`Existing publication status differs for ${key}`);
    }
    const entry = { id, key, slug, modelId: model(slug).id, data: desired, status,
      createdAt: current?.created_at ?? row.created_at, updatedAt: current?.updated_at ?? row.updated_at,
      publishedAt: current?.published_at ?? (status === "published" ? (slug === "blog" && data.date ? `${data.date}T00:00:00.000Z` : row.created_at) : null),
      parentEntryId: current?.parent_entry_id ?? owner?.id ?? null,
      parentFieldId: current?.parent_field_id ?? owner?.fieldId ?? null, position: current?.position ?? owner?.position ?? null,
      action: current ? (isDeepStrictEqual(current.data, desired) ? "reuse" : "fill_missing") : "create",
    };
    entries.push(entry);
    return entry;
  }

  const allocatedSlugs = new Map();
  const uniqueSlug = (slug, row, value) => {
    const id = targetId(contentSources[slug], row.id);
    let candidate = slugify(value) || `${slug}-${row.id}`;
    const occupied = (s) => existing.some((e) => e.model_id === model(slug).id && e.id !== id && !e.deleted_at && e.data.slug === s) || allocatedSlugs.has(`${slug}:${s}`);
    if (occupied(candidate)) candidate += `-${row.id}`;
    if (occupied(candidate)) throw new Error(`Slug collision: ${slug}/${candidate}`);
    allocatedSlugs.set(`${slug}:${candidate}`, id);
    return candidate;
  };

  for (const [slug, table] of Object.entries(contentSources)) for (const r of source[table]) {
    const key = `${table}:${r.id}`;
    const legacy = { legacy_id: Number(r.id) };
    let data;
    let status = "published";
    if (slug === "employee") data = { ...legacy, firstname: r.firstname, prefix: r.surname_prefix, lastname: r.surname,
      email: r.email, big: r.big, secretary: r.supportstaff, description: toRichText(r.content), image: media(r.photo_uid),
      slug: uniqueSlug(slug, r, [r.firstname, r.surname_prefix, r.surname].filter(Boolean).join(" ")) };
    if (slug === "experience") data = { ...legacy, name: r.name, locatie: r.location, content: r.content };
    if (slug === "location") {
      data = { ...legacy, title: r.title, name: r.location_name, street: r.street, number: r.number, zipcode: r.zipcode, city: r.city,
        color: r.color, slug: r.slug, longitude: numeric(r.long), latitude: numeric(r.lat), note: r.locatie_note, walkin: r.walkin,
        employees: links("admin_loc_human_links", "location_id", r.id, "admin_humans", "human_id"),
        specialties: links("admin_loc_specialty_links", "location_id", r.id, "admin_specialties", "specialty_id") };
      for (const [field, value] of Object.entries(r).filter(([field]) => field.startsWith("o_"))) {
        if (value && !/^([01][0-9]|2[0-3]):[0-5][0-9]:00$/.test(value)) throw new Error(`Invalid opening hours on location ${r.id}`);
        data[field] = value?.slice(0, 5) ?? null;
      }
    }
    if (slug === "specialty" || slug === "training") data = { ...legacy, title: r.title, content: toRichText(r.content), slug: r.slug, image: media(r.image_uid),
      ...(slug === "specialty" ? { employees: links("admin_speciality_human_links", "specialty_id", r.id, "admin_humans", "human_id") } : {}) };
    if (slug === "issue" || slug === "group") {
      data = { ...legacy, title: r.title, part: r.part, slug: uniqueSlug(slug, r, slug === "issue" ? r.part : r.title), short: r.short,
        content: toRichText(r.content), image: media(r.background_uid), order: r.order_id };
      if (slug === "issue") data.legacy_stub = r.stub;
      else data.items = source.admin_group_items.filter((i) => String(i.group_id) === String(r.id)).sort((a, b) => Number(a.id) - Number(b.id)).flatMap((i) => {
        const targetTable = ["admin_trainings", "admin_specialties", "admin_issues", "admin_groups"][i.gtype];
        if (!targetTable) throw new Error(`Unknown group item type: ${i.gtype}`);
        const id = targetId(targetTable, i.gid);
        if (!id) { warnings.push({ kind: "orphan_reference", table: "admin_group_items", id: i.id, missing: `${targetTable}:${i.gid}` }); return []; }
        return [reference(id)];
      });
    }
    if (slug === "blog") {
      const author = source.users.find((u) => String(u.id) === String(r.user_id));
      if (!author) throw new Error(`Missing blog author for ${key}`);
      data = { ...legacy, title: r.title, slug: uniqueSlug(slug, r, r.title), intro: toRichText(r.intro), content: toRichText(r.content),
        image: media(r.background_uid), author: author.name, date: r.pdate, meta: r.meta };
      status = r.published && r.pdate && r.pdate <= today ? "published" : "draft";
    }
    if (slug === "page") {
      if (!pageTemplates[r.template_id]) throw new Error(`Unknown page template for ${key}`);
      data = { ...legacy, title: r.title, slug: r.slug, template: pageTemplates[r.template_id].value, homepage: r.homepage, image: media(r.background_uid), content: [] };
      const contentField = model("page").fields.find((f) => f.key === "content");
      const owner = { id: targetId(table, r.id), fieldId: contentField.id, position: 0 };
      if (r.content) {
        const block = add("text_content", `${key}:content`, r, { internal_name: r.title, content: toRichText(r.content) }, status, owner);
        data.content.push(reference(block.id));
      }
      if ([5, 7].includes(r.template_id)) {
        const block = add(r.template_id === 5 ? "specialty_block" : "trainings_block", `${key}:listing`, r,
          { title: r.title, items: [] }, status, { ...owner, position: data.content.length });
        data.content.push(reference(block.id));
      }
    }
    if (slug === "menu_item") {
      if (r.mtype !== 0) throw new Error(`Unsupported menu type for ${key}`);
      const target = targetId("admin_pages", r.value);
      if (!target) throw new Error(`Missing page target for ${key}`);
      data = { ...legacy, title: r.title, target: reference(target), children: source.admin_menus
        .filter((m) => String(m.root_id) === String(r.id)).sort(order).map((m) => reference(targetId(table, m.id))) };
    }
    if (!data) throw new Error(`No mapper for ${slug}`);
    const entry = add(slug, key, r, data, status);
    const oldPath = { employee: `/over/${slugify([r.firstname, r.surname_prefix, r.surname].filter(Boolean).join(" "))}`,
      location: `/locatie/${r.slug}`, specialty: `/specialisatie/${r.slug}`, training: `/training/${r.slug}`,
      issue: `/klachten/${r.part}`, group: `/klacht/${r.id}/${slugify(r.title)}`, blog: `/blog/${r.id}`, page: `/${r.slug}` }[slug];
    if (oldPath) routes.push({ oldPath, model: slug, entryId: entry.id, slug: data.slug });
  }
  const menuRows = source.admin_menus;
  if (menuRows.length) add("menu", "ommelanden:header-menu", menuRows[0], {
    internal_name: "Hoofdmenu", type: "header", items: menuRows.filter((r) => r.root_id === 0).sort(order).map((r) => reference(targetId("admin_menus", r.id))),
  });
  // Include orphans whose parent was deleted; report once per source relationship.
  const joinParents = { admin_loc_human_links: ["location_id", "admin_locations"], admin_loc_specialty_links: ["location_id", "admin_locations"],
    admin_speciality_human_links: ["specialty_id", "admin_specialties"], admin_group_items: ["group_id", "admin_groups"] };
  for (const [table, [column, parent]] of Object.entries(joinParents)) for (const r of source[table]) {
    if (!targetId(parent, r[column])) warnings.push({ kind: "orphan_reference", table, id: r.id, missing: `${parent}:${r[column]}` });
  }
  for (const r of menuRows) if (r.root_id !== 0 && !targetId("admin_menus", r.root_id)) throw new Error(`Missing menu parent for ${r.id}`);
  return { entries, warnings, routes, sourceCounts: Object.fromEntries(Object.entries(contentSources).map(([slug, table]) => [slug, source[table].length])),
    existingModels: Object.fromEntries(byId), pagePublicationPolicy: "Preserve public Rails controller behavior; legacy published flag was unused." };
}
