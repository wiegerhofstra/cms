import type { ExportInput, ExportModel } from "./generate.ts";

export const astroBuildGuide = `## Static Astro builds on Coolify

Set output: 'static' in astro.config.mjs (no server adapter required). Fetch the CMS only in Astro frontmatter, getStaticPaths(), or build scripts. Never fetch authenticated content in browser scripts or hydrated components. Set CMS_URL, CMS_TENANT_SLUG and CMS_ACCESS_TOKEN as private build-time environment variables in Coolify; never prefix the token with PUBLIC_. Use a token with content:read. The Coolify deploy token belongs only in the CMS, never in the consumer or generated files.

Copy client.ts, types.ts and rich-text.ts into src/lib/cms/. Use examples/astro.config.mjs and examples/astro-pages.astro as starting points. The page example belongs at src/pages/[...path].astro and enumerates every page of every routed model from this export, using entry.url for hierarchical paths. It builds the default locale. For additional locales, iterate the tenant's locales and choose distinct URL prefixes; do not silently overwrite colliding paths. Add model-specific renderers and a static 404. Use expanded asset.url values directly and render rich text with renderRichText; a static site has no runtime media proxy. Rebuild after media signing-key rotation. A static page cannot securely send email directly with a CMS token; use a separate authenticated backend for forms.

In Coolify use a source-built application with npm run build and static output directory dist. Ensure the build container can reach the CMS. A prebuilt Docker image will not fetch new content merely by redeploying; use a source build instead. Avoid custom persistent content caches in build scripts and Dockerfiles.

A CMS administrator selects Astro under Settings → Tenants, then saves the application's Deploy Webhook (auth required) and a Coolify API token with deploy permission under Settings → Website. Enable Coolify API access if needed. Use a resource webhook with one application UUID, not a tag webhook. The CMS stores the token encrypted and calls Coolify with force=true so unchanged Git sources still produce fresh HTML.

After publishing, editing, moving, unpublishing or deleting content, an editor clicks Rebuild. Publishing does not automatically queue builds. The CMS waits up to 15 seconds for a deployment UUID and reports "build queued"; it does not wait for the build or claim the site is live. Follow that deployment in Coolify. On failure the old site remains live; fix the build and retry. On a timeout check Coolify before retrying because a deployment may already have started.

Do not implement /api/revalidate, ISR, or a Next.js cache handler. Static HTML changes only when a new build is deployed. Batch editorial changes before rebuilding. Changes made during a build may require another build.

CMS resolvePage can resolve historical redirects for a known old path, but the delivery API cannot enumerate all historical paths. A static catch-all does not resolve requests at runtime. Maintain known redirects in Astro configuration or Coolify's web server, and verify actual HTTP redirects there; do not promise that CMS redirect history is automatically deployed.

References: https://docs.astro.build/en/guides/data-fetching/ and https://coolify.io/docs/core/automation/deploy-webhooks
`;

export function astroPageExample(tenant: ExportInput["tenant"], origin: string, models: ExportModel[]) {
  return `---
// src/pages/[...path].astro; copy generated helpers into src/lib/cms/.
import type { GetStaticPaths } from "astro";
import { createCmsClient } from "../lib/cms/client";
import type { DeliveryEntry } from "../lib/cms/types";

export const getStaticPaths = (async () => {
  const cms = createCmsClient({
    origin: import.meta.env.CMS_URL ?? ${JSON.stringify(origin)},
    tenantSlug: import.meta.env.CMS_TENANT_SLUG ?? ${JSON.stringify(tenant.slug)},
    token: import.meta.env.CMS_ACCESS_TOKEN ?? "",
  });
  // The export inventory includes all models, unlike the capped listModels API.
  const models: string[] = ${JSON.stringify(models.filter((model) => model.pageUrl && model.status === "active").map((model) => model.slug))};
  const paths: { params: { path: string | undefined }; props: { entry: DeliveryEntry; modelSlug: string } }[] = [];
  const seen = new Set<string>();
  for (const modelSlug of models) {
    for await (const entry of cms.iterateEntries(modelSlug, { limit: 100, maxDepth: 2, locale: ${JSON.stringify(tenant.defaultLocale)} })) {
      if (!entry.url) continue;
      const path = entry.url === "/" ? undefined : entry.url.slice(1);
      if (seen.has(entry.url)) throw new Error("Duplicate CMS route: " + entry.url);
      seen.add(entry.url);
      paths.push({ params: { path }, props: { entry, modelSlug } });
    }
  }
  // Errors propagate: never deploy a partial site after a failed CMS request.
  return paths;
}) satisfies GetStaticPaths;

interface Props { entry: DeliveryEntry; modelSlug: string }
const { entry, modelSlug } = Astro.props;
---
<html lang=${JSON.stringify(tenant.defaultLocale)}>
  <head><meta charset="utf-8" /><title>{modelSlug}</title></head>
  <body>
    <!-- Replace with validated, model-specific templates. Astro escapes text. -->
    <h1>{modelSlug}</h1>
    <pre>{JSON.stringify(entry.data, null, 2)}</pre>
  </body>
</html>
`;
}
