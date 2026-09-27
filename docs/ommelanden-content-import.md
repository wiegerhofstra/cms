# Ommelanden content import

The initial import was completed on 2026-09-27. It read the development database
configuration from `../ommelanden/config/database.yml` and media from
`/home/mythor/Downloads/ommendragon_dump/dragonfly/production`.

## Imported content

| Model | Source records |
| --- | ---: |
| Employee | 43 |
| Experience | 5 |
| Location | 11 |
| Specialty | 14 |
| Training | 11 |
| Issue | 8 |
| Group | 3 |
| Blog | 27 |
| Page | 21 |
| Menu item | 6 |
| **Total** | **149** |

The import also creates 15 owned text blocks, two overview blocks and one header
menu. This gives 167 mapped entries: **161 new entries and six existing entries
completed** (one employee and five experiences). Existing text and populated
fields are retained; only missing fields and legacy IDs are filled. The old
soft-deleted Contact page remains deleted, and a new Contact page is imported.
Existing draft prototypes and the manually created footer menu remain intact.

**109 original images** were imported without re-encoding. All 100 files referenced
by current source records exist. The other nine files are preserved in the asset
library. Uploads are downloaded again and checked against their source SHA-256.

**54 stale relationship rows** refer to deleted source staff/specialties. They
are omitted from active references and recorded individually in the private
report; the source rows remain unchanged. All 149 existing source content
records are represented. No authentication accounts, password hashes or audit
logs are imported; only user IDs/names needed for public blog bylines are read.

## Running the import

```bash
npm run migrate:ommelanden:content -- --dry-run
npm run migrate:ommelanden:content -- --apply
npm run verify:ommelanden -- .env.ommelanden-content/<completed-apply-directory>
```

Requires Node.js 22.18+, the model setup, `DATABASE_URL` and the normal S3
configuration. Optional `OMMELANDEN_DATABASE_CONFIG` and
`OMMELANDEN_DRAGONFLY_ROOT` override the source paths. The latter should point
to the `production` directory, whose child paths match the Dragonfly UIDs.

Both dry runs and apply runs read the source in a PostgreSQL `REPEATABLE READ,
READ ONLY` transaction. The connection itself also has
`default_transaction_read_only=on`. Rails is never booted and its ERB is never
executed. Source files are opened only for reading. Credentials are not copied
to reports.

A dry run performs no database or object-storage writes. It does write local
snapshots, a plan, media checksums, route mappings and a report under the ignored
`.env.ommelanden-content` directory (directories mode 0700; files 0600). Keep
these reports private: they contain the original content and public staff details.

Apply first uploads/verifies objects using deterministic keys and conditional
create-only writes. Then it checks that the target snapshot has not changed and
commits all entry/asset/revision writes in one serializable transaction. If the
transaction fails, uploaded files remain in the import prefix for safe reuse on
retry; the importer never deletes objects. A report states whether a database
commit occurred. Original values for completed entries are also stored in entry
revisions, in addition to the private pre-import snapshot.

Reruns match `(model, legacy_id)` or deterministic generated IDs. The initial
matching also recognizes unique employee emails, experience name/location pairs
and active page slugs. A material content conflict, ambiguous match, deleted
previously imported entry or incompatible status stops the import rather than
overwriting an editor's changes. The verification command confirms that another
run would reuse all 167 entries.

The initial run's full audit is in:

```text
.env.ommelanden-content/2026-09-27T07-38-14.790Z-apply/
```

`source.json` retains the original HTML and relationship rows;
`destination-before.json` retains target records before the import;
`media.json` records source paths, object keys and checksums;
`plan.json` records source-to-entry identities and data;
`report.json` records counts, skipped relationships and old routes;
`verification.json` records post-import checks.

## Conversion details

- HTML becomes structured rich text. Paragraphs, headings, emphasis, links,
  ordered/unordered lists, line breaks and all five tables are preserved.
  HTML entities are decoded. Layout classes/styles are not carried into the
  editor. The converter asserts that visible text is preserved and rejects
  unsupported elements instead of silently removing them.
- The editor now supports tables and heading levels 1–6. Tables remain editable,
  and the integration guide documents their nodes and cell spans. See the
  [Tiptap table documentation](https://tiptap.dev/docs/editor/extensions/nodes/table)
  for the extension used.
- Newly created entries retain Rails creation/update timestamps interpreted as
  UTC. Blog publication dates remain calendar dates. Opening hours retain their
  local hours/minutes; no timezone conversion is performed.
- The page publication flag was unused by the old site's public controller.
  Imported pages are published to retain that actual behavior. Blogs honor the
  publication flag and date; future posts remain drafts.
- Existing staff BIG numbers retain their stored values. New imports use the
  original string. No source wording is rewritten.
- Shared staff/treatments remain top-level entries. Ordered relationship arrays
  replace join tables, and page text/overview blocks are owned by their page.
- Clean issue/group/blog/employee slugs are generated where needed; original
  IDs and issue `part` values are retained. Old-to-new route information is in
  the report. Redirects are not deployed by this import.

Two scale issues exposed by this data are fixed: the editor now also loads
images referenced by the current entry when they fall outside the first 100
assets, and delivery retains the 2,000-value per-document rich-text limit while
allowing 20,000 values across a response. The existing depth, asset and component
reference limits still apply.

## Verification

The verification command uses the real entry validation and delivery services
for every published imported entry, including references expanded to depth 2.
It checks that existing field values/assets and other tenants are unchanged,
compares source content/media checksums, and checks rerun idempotence. It does
not create access tokens or modify authentication.

Automated tests cover HTML/tables, safe merging, identities, relationship order,
orphan reporting, revisions, date/time handling, repeat imports, missing asset
previews and rich-text delivery budgets. Browser checks cover loaded images and
the three pricing tables in the imported pricing page.

The next step is migrating the website and form integrations to consume this
content. Empty overview-block selections mean “all published entries” by frontend
convention; the Content API does not expand that selection automatically.
