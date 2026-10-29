# Page hierarchy and URL history

Apply the database migration with `npm run db:migrate`. Existing page models remain flat until hierarchy is enabled.

In a model's **Page URLs** settings, enable **Allow parent pages**. Select a required slug field and a pattern ending in `/{slug}`, such as `/{slug}`, `/news/{slug}`, or `/{locale}/{slug}`. The model pattern applies once to the complete ancestor slug chain. Fixed homepage models can continue to use `/` separately.

The entry editor adds a searchable **Parent page** selector and a read-only URL preview for each language. Parents must be standalone entries in the same model and tenant. Choose “None” for a top-level page. Each individual slug remains a single segment without slashes. Hierarchy is shared across languages; localized slugs fall back independently to the default-language values.

The routing slug is unique among siblings, including drafts and top-level pages. Other slug fields retain their existing uniqueness rules. A page cannot be its own ancestor. Trees are limited to 100 levels, and published paths to 2000 characters. Published children require published ancestors. Move or unpublish published children before unpublishing a parent; move or delete all children before deleting a parent. Move children to the top level before disabling hierarchy.

Saving a published page takes effect immediately. Slug changes, moves, URL-pattern changes, and slug-localization changes preserve previous published paths, including affected descendants. Previous paths remain reserved for the original entry, and repeated changes resolve directly to its current path. A page can return to its own previous URL. Draft-only changes create no public redirects. Deleted and unpublished targets return 404, including through historical URLs.

`pageParentId` is separate from `parentEntryId`, which remains reserved for embedded content blocks. Page parents are recorded in entry revisions. New page relationships and path history are committed with the content change under the tenant's page-path transaction lock.

## Consuming website

Download a fresh integration export from **Settings → API**. Its client now includes:

```ts
const { data } = await cms.resolvePage("/nl/diensten/contact", {
  locale: "nl",
  maxDepth: 2,
});
```

This calls `GET /api/content/{tenantSlug}/resolve?path=...&locale=...` using the existing tenant-scoped bearer token. Paths include any locale or fixed prefix and have no trailing slash except `/`. The locale defaults to the tenant default; it is not inferred from the path.

- `data.kind === "page"`: render `data.entry` using `data.modelSlug`. The entry contains its full `url` and `pageParentId`.
- `data.kind === "redirect"`: send a permanent HTTP redirect to `data.location` with `data.status` (308). The CMS returns a JSON instruction, not an HTTP redirect.
- HTTP 404: render the website's missing-page response.

For Next.js, use a catch-all page such as `app/[[...slug]]/page.tsx`, await `params`, and join the segments into the complete request path. Call `permanentRedirect` from `next/navigation` for redirect instructions. Handle API errors separately from framework redirect control flow. Keep existing static routes and ensure CMS URL patterns do not overlap website-owned routes.

Use full paths for routing: `findEntryBySlug` can return ambiguous matches when branches share a slug. Use delivered `entry.url` and rich-text `attrs.href` for links instead of reconstructing paths.

The generated client fetches with `cache: "no-store"`. If the website adds caching, tag all CMS-derived pages, navigation, redirects, and cached 404s for tenant-wide invalidation. Use the existing **Revalidate website** action after publishing or moving content. Revalidation is still manual; the CMS does not automatically send the configured webhook on save. A consuming website must adopt full-path resolution to serve these redirects.

## Verification

`npm run test:entries` covers path construction and bounded traversal. `npm run test:links:integration` exercises the real database, sibling and cross-model collisions, localization, cycles, transaction rollback, concurrent claims, parent availability, revisions, redirects, delivery links, and authenticated path lookup. `npm run test:integration` checks the generated client and API contract.
