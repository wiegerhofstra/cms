# Consumer websites on Coolify

Apply database migrations with `npm run db:migrate` before deploying. Migration
0017 assigns **Next.js** to every existing tenant and preserves its revalidation
settings. New tenants also default to Next.js.

Administrators choose **Next.js** or **Astro (static)** for each tenant in
**Settings → Tenants**. **Settings → API**, copied guides, integration bundles,
and the documentation sync API follow that selection.

**Settings → Website** (the existing `/app/settings/revalidation` URL) configures
the selected framework. Settings and encrypted tokens are stored separately for
Next.js and Astro; switching back restores the previous configuration. Saving
settings or changing framework never deploys a site. Administrators manage these
settings; tenant members and administrators can request website updates.

## Next.js

Save the deployed consumer's full `/api/revalidate` URL and the value of its
`CMS_REVALIDATION_SECRET` environment variable configured in Coolify. The
**Revalidate** header button sends a server-side `POST` with
`Authorization: Bearer <token>`. Any 2xx is accepted. The integration bundle
includes a handler and a Next.js route example for tenant-wide invalidation.

## Astro

1. Build the consumer from source in Coolify with `npm run build`, Astro
   `output: 'static'`, and static output directory `dist`. No server adapter or
   revalidation endpoint is needed.
2. Make `CMS_URL`, `CMS_TENANT_SLUG`, and a `content:read` `CMS_ACCESS_TOKEN`
   available during the build. Never use `PUBLIC_` variables for the token.
   Fetch in frontmatter or `getStaticPaths()`. The bundle includes a paginated
   static route example; adapt it to your models and locale routing.
3. Enable Coolify API access. Create an API token with `deploy` permission for
   the application's team. Copy the application's **Deploy Webhook (auth required)**
   from its Webhooks tab, then save it and the token under **Settings → Website**.
4. After a batch of published edits, click **Rebuild** in the tenant header.
   The CMS calls Coolify with `POST /api/v1/deploy?uuid=<application>&force=true`
   and bearer authentication. Only a single application UUID is accepted.
   `force=true` bypasses build caching because CMS changes do not change Git.
5. The CMS requires a matching deployment UUID before reporting **build queued**.
   The dashboard shows the request time and deployment ID. Check that deployment
   in Coolify for progress, failure, and completion; queued does not mean live.

Publishing does **not** automatically trigger a build. Failed builds leave the
old site live. On a timeout, inspect Coolify before retrying: it may have accepted
the request. Custom persistent content caches must be disabled in the consumer.
Redeploying a prebuilt Docker image cannot regenerate Astro content; configure a
source build. Changes during a build may require another rebuild.

Static routes need explicit handling for historical redirects. The CMS resolver
can resolve a known old path but cannot enumerate every historical URL. Configure
known redirects in Astro or the static web server. Use delivered asset URLs
directly, and rebuild after media signing-key rotation. Forms that call the email
API need a separate backend; never expose the CMS token in browser JavaScript.

## Credentials and failures

Leave the token blank on later saves to preserve it. Clear the URL and save to
remove that framework's configuration. Tokens are never returned to the browser
or integration exports. They use authenticated AES-256-GCM encryption bound to
the tenant, with a key derived from `BETTER_AUTH_SECRET`; save tokens again if
that secret is rotated. Coolify deployment URLs are also omitted from exports.

Use HTTPS for deployed endpoints. Requests time out after 15 seconds and never
follow redirects. Upstream error bodies are not exposed. An open form or dialog
rejects submission if the tenant's framework has changed since it was rendered.

Run `npm run test:revalidation` and `npm run test:integration` for request,
credential, and export coverage. With a migrated test database,
`npm run test:revalidation:integration` also verifies authorization, tenant and
framework isolation, token preservation, and build status against a local mock
deployment server. Its temporary tenants are cleaned up.

References: [Coolify deploy webhooks](https://coolify.io/docs/core/automation/deploy-webhooks),
[Astro data fetching](https://docs.astro.build/en/guides/data-fetching/).
