# Ommelanden: model migration

The definitions in `scripts/ommelanden/models.mjs` extend the existing tenant at
`/app/ommelanden/models`. They are based on the legacy Rails schema, models,
admin forms and public JSON views in `../ommelanden`. This step creates model
definitions. The content/media import is implemented separately; see
[the content import guide and results](ommelanden-content-import.md).

## Run

Requires Node.js 22.18+ and the normal CMS `DATABASE_URL` environment. Next's
environment loader reads `.env.local`. The tenant must already exist.

```bash
npm run db:migrate
npm run migrate:ommelanden:models             # preview; transaction is rolled back
npm run migrate:ommelanden:models -- --apply   # commit to the ommelanden tenant
npm run test:entries
npm run test:integration
npm run test:ommelanden                       # PostgreSQL tests; fixtures rolled back
```

The setup is idempotent. It creates missing models/fields and component target
rows in one transaction. Existing model IDs, names, field IDs/keys, ordering,
labels, title choices and custom fields/configuration are retained. Additional
component targets and template options are retained. Incompatible field types
or list cardinalities abort the transaction; archived models also abort.
Model/field timestamps change only when the setup changes them.

Intentional corrections: `employee.big` becomes text, and `employee.email` and
`location.name` become optional to match the legacy records. All 13 old page
template choices are added. No entries, revisions, assets, users or memberships
are changed. Historical numeric BIG values remain intact and display in the
text editor; saving that field or importing from Rails stores a string. Restore
leading zeros from the original Rails string during the later import.

## Content model mapping

All source-backed models have an optional numeric `legacy_id`. Pair it with the
model slug when mapping Rails IDs to new UUIDs; IDs overlap between Rails tables.
CMS entry status and timestamps replace `published`, `created_at`, `updated_at`.

| Legacy source | New model | Mapping and behavior |
| --- | --- | --- |
| `admin_humans` | `employee` | `surname_prefix → prefix`, `surname → lastname`, `supportstaff → secretary`, `content → description`, `photo_uid → image`. Keep first name, email and BIG number. Import computed full-name slug. The added slug is optional until the existing employee is backfilled. |
| `admin_experiences` | `experience` | Preserve your `name`, `locatie` (old `location`) and plain-text `content`. The location is testimonial text, not a clinic relation. |
| `admin_locations` | `location` | `location_name → name`, `long → longitude`, `lat → latitude`, `locatie_note → note`; preserve address, color, walk-in text and slug. Fourteen opening/closing fields retain their old keys. |
| `admin_specialties` | `specialty` | Title, rich-text content, image, unique slug, ordered employees. |
| `admin_trainings` | `training` | Title, rich-text content, image and unique slug. |
| `admin_issues` | `issue` | Title, part/short name, summary, rich-text content, image and display order (`order_id → order`). Preserve unused `stub` in `legacy_stub`. Import old `part` into slug after validating it. |
| `admin_groups` | `group` | Title, part/short name, summary, rich-text content, image, display order and ordered mixed-model `items`. Generate a clean slug from the title; retain the old ID for old `/klacht/:id/:slug` URLs or redirects. |
| `admin_blogs` | `blog` | Title, rich-text intro/content, image, `pdate → date`, meta description and `user.name → author`. Generate a unique slug and retain old ID for `/blog/:id/:title` URLs or redirects. Author is a public name, not an authenticated CMS user. |
| `admin_pages` | `page` | Keep your title, slug, template, image and ordered content blocks. Convert old HTML content into a `text_content` entry and reference it. Preserve homepage flag. |
| `admin_menus` | `menu_item` inside `menu.items` | `title → title`, `value → target` page reference for `mtype=0`. Group root items (`root_id=0`) into a header menu; order by `order_id`. Map nested root IDs to ordered `children`. Existing external URLs and footer menus remain supported. |

`menu`, `text_content`, `specialty_block`, and `trainings_block` retain your new
CMS design rather than corresponding directly to Rails tables. Specialty and
training blocks have optional headings and ordered selections. The proposed
frontend convention is: an empty selection displays the full published
collection. This is not automatic Content API behavior; implement it in the
website when migrating its renderers.

### Relationships

- `admin_loc_human_links`: `location.employees`, ordered by `order_id` then ID.
- `admin_loc_specialty_links`: `location.specialties`, ordered by `order_id` then ID.
- `admin_speciality_human_links`: `specialty.employees`, ordered by `order_id` then ID.
- `admin_group_items`: `group.items` maps `gtype` 0 → training, 1 → specialty,
  2 → issue, 3 → group; `gid` resolves through the source-model ID map. This
  table has no explicit order column; use ID order for a deterministic import.

Use existing-entry references (`{ childEntryId: uuid }`) for shared employees,
locations, specialties, trainings, issues and groups. Keep these entries at the
top level (`parentEntryId = null`); do not make copies per parent. Owned text
blocks and submenu items can be nested. Store each relationship in one direction
and derive reverse lookups in the website to avoid conflicting duplicate lists.
The API has no reverse-reference filter yet, so that website lookup must load
the relevant collections. Multi-model and self-references already work in the CMS.

### Page templates

The ordered `pageTemplates` array preserves all Rails template IDs (0–12) and
their old parameterized frontend values, including appointment pages and Egym.
The existing `content` and `contact` values stay valid. Select the corresponding
template when importing, then convert old HTML into the existing rich-text JSON
format. Do not store raw HTML as a rich-text field or turn a string into a
component reference.

## Reusable CMS feature: time of day

`time` fields use a native time picker and store local `HH:mm` strings such as
`09:00` and `23:59`. They deliberately have no date, timezone, seconds or UTC
conversion. Empty optional fields represent unknown/closed hours; `00:00` is a
valid midnight value. Saving and publishing reject malformed values. Required
time fields use the existing required-field publishing check.

This is available to every tenant through the model editor. The integration
export includes the new type, minute-precision editor schema and sample values.
As with other primitives, delivery can pass through historical JSON values;
the export keeps that distinction from editor validation.

## Content import requirements

These requirements are implemented by `migrate:ommelanden:content`. Website
rendering, form integrations and redirects remain a separate migration step.

1. Export actual Rails records and Dragonfly media. The repository establishes
   the structure but does not reveal all current content or malformed values.
2. Match existing entries before importing (the new CMS already contains manual
   content); create a source-model/ID → entry UUID map. Validate numeric
   coordinates, slug collisions, missing assets and orphaned references.
3. Convert rich HTML to the CMS rich-text document format, import images as
   assets, then create entry references after all target entries exist.
4. Preserve actual publication behavior. Inspection of the live source showed
   that every page has `published=false`, while `HomeController#page` serves them
   without filtering that flag. The importer publishes those pages. Blogs still
   honor their publication flag and date. Publish referenced content too: draft references disappear
   from delivery. The old blog listing also filters `pdate <= today`; the new
   CMS has no scheduled publishing, so future posts must remain drafts until
   due or the website must explicitly filter publication dates.
5. Preserve old URLs or add redirects using `legacy_id` and old slugs. Render
   page templates, blocks, navigation and date ordering in the new website.

Rails login accounts, password hashes and audit history are separate concerns;
they are not website content models. The CMS already owns authentication and
entry revisions. Contact/appointment forms and their external integrations
also need a later website migration.
