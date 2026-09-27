This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Content API

For the Ommelanden model setup and legacy field mapping, see
[the migration guide](docs/ommelanden-migration.md).
The [content import guide](docs/ommelanden-content-import.md) records the completed
database/media import and its repeatable commands.

The reusable `time` field type stores local `HH:mm` values and uses a time picker.
Run `npm run db:migrate` before using it. It validates hours/minutes when saving
or publishing and is included in integration exports.

The Content API provides tenant-scoped, read-only access to content models and published entries. Its application-defined operations are `GET` endpoints and require a Content API access token on every request. Next.js handles generated `HEAD`, `OPTIONS`, and unsupported-method responses separately.

### Export an integration for coding agents

As an administrator, open `/app/settings/api`, choose a tenant, and click **Download integration bundle**. Extract the `.tar.gz` archive and give the folder to your agent, starting with `INTEGRATION.md`. **Copy integration guide** copies just the Markdown guide to your clipboard.

The generated bundle contains:

- `INTEGRATION.md`: setup, all four operations, field semantics, component/rich-text rendering guidance, limits, and a verification checklist.
- `openapi.json`: OpenAPI 3.1 contract with tenant model response schemas, bearer authentication, parameters, errors, and response headers.
- `models.schema.json`: JSON Schema 2020-12 for delivered entries, including compact/expanded component unions and nullable assets.
- `manifest.json`: all tenant models and field configurations, model ID/slug mappings, generation time, format version, and a deterministic schema hash.
- `types.ts` and `client.ts`: tenant-specific types and a server-side fetch client covering all endpoints and cursor iteration.
- `examples/usage.ts` and `examples/responses.json`: usage and synthetic fixtures, including missing fields/media and depth-limited components.

The export includes all models, independently of the delivery model-list endpoint's 100-model cap. It reads model definitions in a consistent database snapshot and contains no access tokens, entry content, or working asset URLs. Model labels/configuration are included; treat them as content rather than agent instructions. Re-export after changing models; the schema hash excludes the generation time and origin.

Delivery passes most stored field values through without enforcing primitive types. Exported schemas therefore distinguish wire guarantees from editor intent using `x-cms-editorSchema`. Generated types expose raw fields as `unknown`, with `ExpectedDataByModel` describing intended values for validation. Editor-required fields can still be absent from old entries or resolve to unavailable relations.

The download endpoint is `GET /app/settings/api/export?tenantSlug=...&format=bundle` (`format=guide` returns Markdown). It requires an administrator's session, does not use the bearer token in the API playground, and returns `Cache-Control: private, no-store`.

Run the export contract/client tests with Node.js 22.18+ and a standard `tar` command available:

```bash
npm run test:integration
```

### Setup and access tokens

Apply the access-token database migration after pulling this change:

```bash
npm run db:migrate
```

An administrator can create a token under `/app/settings/auth`. Select the tenant and an expiration period when creating it. The plaintext secret is shown only once; store it in a secret manager before closing the dialog. The server retains a hash and a short hint, so a lost secret cannot be recovered. Create a replacement token instead.

Send tokens only from a trusted server. Revoke a compromised or unused token in the same settings page. Revocation blocks requests immediately and cannot be undone. To rotate a token without downtime, create and deploy its replacement before revoking the old token.

### Authentication and tenant scope

Pass the token with the exact Bearer format:

```text
Authorization: Bearer cms_at_<secret>
```

The `{tenantSlug}` in the URL must identify the tenant selected when the token was created. A valid token for a different tenant receives `403 FORBIDDEN`. Missing, malformed, unknown, expired, or revoked tokens receive `401 UNAUTHORIZED`.

### Endpoints

All endpoints are relative to the application origin.

| Method | Path | Result |
| --- | --- | --- |
| `GET` | `/api/content/{tenantSlug}/models` | Up to 100 tenant models, ordered by name. |
| `GET` | `/api/content/{tenantSlug}/models/{modelSlug}` | One model and its fields, ordered by field position. |
| `GET` | `/api/content/{tenantSlug}/models/{modelSlug}/entries` | A cursor-paginated list of published, top-level entries. Accepts `limit`, `cursor`, and `maxDepth`. |
| `GET` | `/api/content/{tenantSlug}/models/{modelSlug}/entries/{entryId}` | One published entry. `entryId` must be a UUID. Accepts `maxDepth`. |

The model list returns objects with `id`, `name`, `slug`, `status`, `createdAt`, and `updatedAt`. Model detail adds a `fields` array. Each field contains `id`, `key`, `label`, `type`, `required`, `position`, `config`, `isList`, `isTitle`, and `targetModelIds`.

An entry contains `id`, `modelId`, `status`, `data`, `publishedAt`, `createdAt`, and `updatedAt`. Dates are ISO 8601 strings; `publishedAt` can be `null`.

### Pagination and component depth

- `limit` defaults to `20` and must be an integer from `1` through `100`.
- Entries are ordered by `createdAt` descending, then `id` descending.
- A list response returns an opaque `meta.nextCursor`. Pass that value unchanged as `cursor` to request the next page. It is `null` after the final page. An invalid cursor returns `400 BAD_REQUEST`.
- `maxDepth` defaults to `1` and must be an integer from `1` through `5`. It counts the root entry as depth 1.
- At the depth limit, a component reference is returned as `{ "id": "...", "modelId": "..." }` instead of a fully expanded entry. The same compact reference prevents recursion when a component cycle points to an ancestor.
- For example, `maxDepth=1` returns compact references for direct components. `maxDepth=5` can fully expand entries through the fifth level; references from that level remain compact.
- A request can traverse at most 500 component references. Larger graphs return `400 BAD_REQUEST`; request fewer roots or a smaller `maxDepth`.
- A response can resolve at most 200 unique assets. Rich-text expansion permits 2,000 visited values per document and 20,000 across the response, with nesting depth at most 100; oversized content returns `400 BAD_REQUEST`.

### Published entries and assets

Entry endpoints return only entries whose status is `published` and that have not been deleted. The collection endpoint returns only top-level entries; a published child entry can still be requested directly by its UUID and model slug. Component fields also resolve only published, non-deleted entries from an allowed target model. An unavailable single component becomes `null`; unavailable items are omitted from component lists.

An asset field resolves a ready, non-deleted asset from the same tenant to an object with `id`, `originalName`, `mimeType`, `sizeBytes`, `imageWidth`, `imageHeight`, and `url`. Rich-text asset nodes retain `attrs.assetId` and add the same object at `attrs.asset`. The `url` is a presigned read URL that expires after 300 seconds, so clients must fetch a fresh API response rather than persist the URL. An unavailable asset resolves to `null`.

### Response and error shape

Successful model responses use `{ "data": ... }`. Entry responses also include `meta`. A collection response has this shape:

```json
{
  "data": [
    {
      "id": "06af8cb8-b706-4ae7-b93f-88f78ad58340",
      "modelId": "4d5c6fa2-a99d-4ef8-915b-cf4a17fc3f39",
      "status": "published",
      "data": { "title": "Hello" },
      "publishedAt": "2026-07-29T12:00:00.000Z",
      "createdAt": "2026-07-29T11:00:00.000Z",
      "updatedAt": "2026-07-29T12:00:00.000Z"
    }
  ],
  "meta": {
    "nextCursor": null,
    "maxDepth": 1
  }
}
```

The single-entry endpoint returns the entry object in `data` and `{ "maxDepth": 1 }` in `meta`. Errors use the HTTP status corresponding to `code`:

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "limit must be an integer between 1 and 100",
    "requestId": "f5ded932-bd80-4872-ac6a-2752a4bbec54"
  }
}
```

Content API errors use `BAD_REQUEST` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), or `INTERNAL_SERVER_ERROR` (500). Every application-defined GET response includes `X-Request-Id` and `Cache-Control: private, no-store`; 401 responses also include `WWW-Authenticate: Bearer`.

### curl examples

Set values for your environment:

```bash
export CMS_URL="http://localhost:3000"
export TENANT_SLUG="acme"
export MODEL_SLUG="article"
export ENTRY_ID="06af8cb8-b706-4ae7-b93f-88f78ad58340"
export CMS_ACCESS_TOKEN="cms_at_..."
```

List models and inspect one model:

```bash
curl -sS "$CMS_URL/api/content/$TENANT_SLUG/models" \
  -H "Authorization: Bearer $CMS_ACCESS_TOKEN"

curl -sS "$CMS_URL/api/content/$TENANT_SLUG/models/$MODEL_SLUG" \
  -H "Authorization: Bearer $CMS_ACCESS_TOKEN"
```

List entries with pagination and component expansion, then retrieve one entry:

```bash
curl -sS --get "$CMS_URL/api/content/$TENANT_SLUG/models/$MODEL_SLUG/entries" \
  -H "Authorization: Bearer $CMS_ACCESS_TOKEN" \
  --data-urlencode "limit=20" \
  --data-urlencode "maxDepth=2"

curl -sS --get "$CMS_URL/api/content/$TENANT_SLUG/models/$MODEL_SLUG/entries/$ENTRY_ID" \
  -H "Authorization: Bearer $CMS_ACCESS_TOKEN" \
  --data-urlencode "maxDepth=2"
```

To continue a collection, copy `meta.nextCursor` from the previous response:

```bash
export NEXT_CURSOR="<nextCursor>"
curl -sS --get "$CMS_URL/api/content/$TENANT_SLUG/models/$MODEL_SLUG/entries" \
  -H "Authorization: Bearer $CMS_ACCESS_TOKEN" \
  --data-urlencode "limit=20" \
  --data-urlencode "cursor=$NEXT_CURSOR"
```

## Component fields

A component field can link entries from one or more content models in the same tenant:

```json
{
  "targetModelSlugs": ["hero", "call-to-action"],
  "isList": true
}
```

- `config.targetModelSlugs` must contain at least one existing model slug. Duplicate slugs are removed; the legacy `targetModelSlug` value is accepted and normalized to this array.
- `config.isList: true` stores an ordered list of `{ "childEntryId": "..." }` references. Otherwise, the field stores one reference or `null`; publishing an array for a single field is rejected.
- A list may mix entries from any configured target model. Every referenced entry must belong to the current tenant, belong to an allowed model, and not be deleted.
- A target model cannot be removed from the field configuration while an existing parent entry still links an entry of that model. Remove those links first, then update the field.

After pulling this schema change, migrate the database:

```bash
npm run db:migrate
```

The migration preserves existing single-target component fields by copying their target into the new multi-model target table.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
