"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Copy, Download, KeyRound, Loader2, Play, Terminal, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cmsPublicUrl } from "@/lib/cms/public-url";
import type { TenantSummary } from "@/lib/cms/types";

type EndpointId = "models" | "model" | "entries" | "entry" | "asset" | "resolve";

type EndpointDefinition = {
  id: EndpointId;
  title: string;
  description: string;
  path: string;
  pathParameters: Array<{ key: "modelSlug" | "entryId" | "assetId"; label: string; placeholder: string; description: string }>;
  queryParameters: Array<{
    key: "limit" | "cursor" | "maxDepth" | "locale" | "slug" | "slugField" | "path";
    label: string;
    placeholder: string;
    description: string;
  }>;
};

type ParameterValues = Record<"modelSlug" | "entryId" | "assetId" | "limit" | "cursor" | "maxDepth" | "locale" | "slug" | "slugField" | "path", string>;

type ApiResult = {
  status: number | null;
  statusText: string;
  requestId: string | null;
  durationMs: number;
  url: string;
  body: unknown;
};

const endpoints: EndpointDefinition[] = [
  {
    id: "resolve", title: "Resolve a page URL", description: "Find a published page by its full path, or return a permanent redirect instruction for a previous URL. Your website sends the redirect.",
    path: "/api/content/{tenantSlug}/resolve", pathParameters: [],
    queryParameters: [
      { key: "path", label: "path", placeholder: "/services/contact", description: "Required full website path. Include any language prefix. No trailing slash except /." },
      { key: "locale", label: "locale", placeholder: "nl", description: "Language to resolve. Defaults to the tenant default; it is not inferred from the path." },
      { key: "maxDepth", label: "maxDepth", placeholder: "1", description: "Component expansion depth, from 1 to 5." },
    ],
  },
  {
    id: "models",
    title: "List content models",
    description: "Returns the content models available in the selected tenant, with its languages in meta.",
    path: "/api/content/{tenantSlug}/models",
    pathParameters: [],
    queryParameters: [],
  },
  {
    id: "model",
    title: "Get a content model",
    description: "Returns one model and its field definitions.",
    path: "/api/content/{tenantSlug}/models/{modelSlug}",
    pathParameters: [
      { key: "modelSlug", label: "Model slug", placeholder: "articles", description: "The model's URL-safe slug." },
    ],
    queryParameters: [],
  },
  {
    id: "entries",
    title: "List published entries",
    description: "Returns a cursor-paginated collection of published entries for a model.",
    path: "/api/content/{tenantSlug}/models/{modelSlug}/entries",
    pathParameters: [
      { key: "modelSlug", label: "Model slug", placeholder: "articles", description: "The model whose entries you want to read." },
    ],
    queryParameters: [
      { key: "limit", label: "limit", placeholder: "20", description: "Entries per page, from 1 to 100. Defaults to 20." },
      { key: "cursor", label: "cursor", placeholder: "Cursor from the previous response", description: "Pass meta.nextCursor to request the next page." },
      { key: "slug", label: "slug", placeholder: "about-us", description: "Only entries with this slug. Translatable slugs match the slug in the requested locale, falling back to the default language." },
      { key: "slugField", label: "slugField", placeholder: "slug", description: "Which slug field to match. Only needed when the model has more than one slug field." },
      { key: "maxDepth", label: "maxDepth", placeholder: "1", description: "Component expansion depth, from 1 to 5. Defaults to 1." },
      { key: "locale", label: "locale", placeholder: "nl", description: "Language of translatable fields. Missing translations use the default value. Defaults to the tenant's default language." },
    ],
  },
  {
    id: "entry",
    title: "Get a published entry",
    description: "Returns a single published entry by its UUID.",
    path: "/api/content/{tenantSlug}/models/{modelSlug}/entries/{entryId}",
    pathParameters: [
      { key: "modelSlug", label: "Model slug", placeholder: "articles", description: "The model that owns the entry." },
      { key: "entryId", label: "Entry ID", placeholder: "00000000-0000-0000-0000-000000000000", description: "The published entry's UUID." },
    ],
    queryParameters: [
      { key: "maxDepth", label: "maxDepth", placeholder: "1", description: "Component expansion depth, from 1 to 5. Defaults to 1." },
      { key: "locale", label: "locale", placeholder: "nl", description: "Language of translatable fields. Missing translations use the default value. Defaults to the tenant's default language." },
    ],
  },
  {
    id: "asset",
    title: "Get an asset",
    description: "Returns one ready asset with a stable media URL backed by the CMS cache. Store asset IDs as the source of truth.",
    path: "/api/content/{tenantSlug}/assets/{assetId}",
    pathParameters: [
      { key: "assetId", label: "Asset ID", placeholder: "00000000-0000-0000-0000-000000000000", description: "The asset's UUID, as found in entry data." },
    ],
    queryParameters: [],
  },
];

const emptyValues: ParameterValues = {
  modelSlug: "",
  entryId: "",
  assetId: "",
  limit: "",
  cursor: "",
  maxDepth: "",
  locale: "",
  slug: "",
  slugField: "",
  path: "",
};

export function ApiReferencePanel({
  tenants,
  initialTenantSlug,
}: {
  tenants: TenantSummary[];
  initialTenantSlug: string;
}) {
  const [tenantSlug, setTenantSlug] = useState(initialTenantSlug || tenants[0]?.slug || "");
  const [token, setToken] = useState("");
  const selectedTenant = tenants.find((tenant) => tenant.slug === tenantSlug);
  const astro = selectedTenant?.consumerType === "astro";

  return (
    <div className="grid gap-6">
      <Card className="bg-inverse text-inverse-foreground ring-0">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="mb-2 text-sm opacity-70">Content delivery API</p>
              <CardTitle className="text-xl">API reference</CardTitle>
              <CardDescription className="mt-1 text-inverse-foreground/70">
                Read published content over a tenant-scoped, JSON API. Choose an endpoint below to send a live request.
              </CardDescription>
            </div>
            <Badge className="border border-inverse-foreground/20 bg-inverse-foreground/10 text-inverse-foreground">
              JSON
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 rounded-lg border border-inverse-foreground/15 bg-inverse-foreground/5 p-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="api-tenant" className="text-inverse-foreground">Tenant</FieldLabel>
              <Select value={tenantSlug} onValueChange={setTenantSlug}>
                <SelectTrigger id="api-tenant" className="w-full border-inverse-foreground/20 bg-inverse-foreground/10 text-inverse-foreground">
                  <SelectValue placeholder="Select a tenant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {tenants.map((tenant) => (
                      <SelectItem key={tenant.id} value={tenant.slug}>{tenant.name} · {tenant.slug}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription className="text-inverse-foreground/60">Used for the tenantSlug path parameter.</FieldDescription>
            </Field>
            <Field>
              <div className="flex items-center justify-between gap-3">
                <FieldLabel htmlFor="api-token" className="text-inverse-foreground">Bearer token</FieldLabel>
                <Link href="/app/settings/auth" className="text-xs text-inverse-foreground/70 underline underline-offset-4 hover:text-inverse-foreground">
                  Manage tokens
                </Link>
              </div>
              <Input
                id="api-token"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="cms_at_..."
                className="border-inverse-foreground/20 bg-inverse-foreground/10 font-mono text-inverse-foreground placeholder:text-inverse-foreground/40"
              />
              <FieldDescription className="text-inverse-foreground/60">Kept only in this page and sent in the Authorization header.</FieldDescription>
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{astro ? "Astro · Static site on Coolify" : "Next.js · Hosted on Coolify"}</CardTitle>
          <CardDescription>The integration guide and bundle below match this tenant’s consumer type.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-muted-foreground">
          {astro ? <>
            <p>Use <code>{"output: 'static'"}</code> and fetch published content in Astro frontmatter or <code>getStaticPaths()</code> at build time. The bundle includes a static route example with pagination and hierarchical URLs.</p>
            <p>In Coolify, build from source with <code>npm run build</code> and serve <code>dist</code>. Make <code>CMS_URL</code>, <code>CMS_TENANT_SLUG</code> and <code>CMS_ACCESS_TOKEN</code> available at build time. Keep the token private; never use a <code>PUBLIC_</code> prefix.</p>
            <p>Configure the Coolify deploy webhook and API token in Website settings. After publishing changes, click Rebuild to queue a fresh build. The website updates after deployment succeeds; follow progress in Coolify. Astro has no revalidation endpoint.</p>
            <p>Static pages cannot securely call the email API with a private token. Use a separate backend for forms.</p>
            <a href="https://docs.astro.build/en/guides/data-fetching/" target="_blank" rel="noreferrer" className="underline">Astro build-time data fetching</a>
          </> : <>
            <p>Fetch CMS content on the server and keep <code>CMS_ACCESS_TOKEN</code> private. The bundle includes a Next.js route handler for tenant-wide cache revalidation.</p>
            <p>Set the consumer’s <code>CMS_REVALIDATION_SECRET</code> in Coolify and save the same secret with its revalidation URL in Website settings. Click Revalidate after publishing changes.</p>
          </>}
          <div className="flex flex-wrap gap-4">
            <Link href={`/app/settings/revalidation${selectedTenant ? `?tenant=${selectedTenant.id}` : ""}`} className="underline">Configure website updates</Link>
            <Link href="/app/settings/tenants" className="underline">Change consumer type</Link>
          </div>
        </CardContent>
      </Card>

      <AgentExportCard key={tenantSlug} tenantSlug={tenantSlug} />

      <section aria-labelledby="available-endpoints" className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="available-endpoints" className="text-lg font-semibold">Content endpoints</h2>
            <p className="text-sm text-muted-foreground">Content endpoints are read-only and require the content:read permission.</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <KeyRound className="size-3.5" /> Bearer authentication required
          </div>
        </div>

        {endpoints.map((endpoint) => (
          <EndpointCard key={endpoint.id} endpoint={endpoint} tenantSlug={tenantSlug} token={token} />
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Send email</CardTitle>
          <CardDescription>Submit an email using the selected tenant’s SMTP settings and a token with the email:send permission.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          <code className="break-all font-mono">POST /api/email/{tenantSlug || "{tenantSlug}"}/send</code>
          <p className="text-muted-foreground">Send JSON with to, subject and text. Optional fields: from, replyTo and html. The from address must be allowed in the tenant’s settings; omit it to use the default sender.</p>
          <pre className="overflow-x-auto rounded-xl bg-muted p-4 font-mono text-xs">{JSON.stringify({ to: "recipient@example.com", subject: "Hello", text: "Hello from the website.", html: "<p>Hello from the website.</p>" }, null, 2)}</pre>
          <p className="text-muted-foreground">Use Authorization: Bearer and Content-Type: application/json. Supports one recipient per message, up to 512 KiB per request and 30 attempts per minute per tenant. Success returns data.messageId and data.status = &quot;accepted&quot;, confirming SMTP submission.</p>
          <Link href="/app/settings/email" className="underline underline-offset-4">Configure email and send a test</Link>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardContent className="flex gap-3">
          <Terminal className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-medium">Response envelope</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Successful requests return <code className="font-mono text-foreground">data</code> and, when relevant, <code className="font-mono text-foreground">meta</code>.
              Errors return <code className="font-mono text-foreground">error.code</code>, <code className="font-mono text-foreground">error.message</code>, and a request ID.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AgentExportCard({ tenantSlug }: { tenantSlug: string }) {
  const [pending, setPending] = useState<"bundle" | "guide" | "setup" | null>(null);
  const [tokenEnv, setTokenEnv] = useState("CMS_ACCESS_TOKEN");
  const [envFile, setEnvFile] = useState(".env.local");
  const validTokenEnv = /^[A-Za-z_][A-Za-z0-9_]*$/.test(tokenEnv);

  async function exportIntegration(format: "bundle" | "guide" | "setup") {
    setPending(format);
    try {
      const query = new URLSearchParams({ tenantSlug, format });
      if (format === "setup") {
        query.set("tokenEnv", tokenEnv);
        query.set("envFile", envFile);
      }
      const response = await fetch(`/app/settings/api/export?${query}`, { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? "The integration export could not be created");
      }
      if (format === "guide") {
        await navigator.clipboard.writeText(await response.text());
        toast.success("Integration guide copied");
      } else {
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement("a");
        link.href = url;
        link.download = `cms-${tenantSlug}-${format === "setup" ? "docs-setup" : "integration"}.tar.gz`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
        toast.success(format === "setup" ? "Documentation setup downloaded" : "Integration bundle downloaded");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The export failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Export for agents</CardTitle>
        <CardDescription>
          Give your coding agent the selected tenant’s models, API contract, and working examples to build a CMS integration.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          Includes a Markdown guide, OpenAPI and model schemas, TypeScript types, a server-side client, and synthetic examples.
          Generated from all current models. No access tokens or entry content are included.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!tenantSlug || pending !== null} onClick={() => exportIntegration("bundle")}>
            {pending === "bundle" ? <Loader2 className="animate-spin" /> : <Download />}
            Download integration bundle
          </Button>
          <Button variant="outline" disabled={!tenantSlug || pending !== null} onClick={() => exportIntegration("guide")}>
            {pending === "guide" ? <Loader2 className="animate-spin" /> : <Copy />}
            Copy integration guide
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Extract the .tar.gz file and give your agent the folder, starting with INTEGRATION.md. Re-export after changing your models.
        </p>
        <div className="grid gap-4 border-t pt-4">
          <div>
            <h3 className="font-medium">Update docs from your Node project</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Set up once, then run <code className="font-mono text-foreground">npm run cms:docs</code> to refresh <code className="font-mono text-foreground">docs/cms/</code>.
              Reuse your existing CMS token. Requires Node.js 22.18 or newer.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="docs-token-env">Token environment variable</FieldLabel>
              <Input id="docs-token-env" value={tokenEnv} onChange={(event) => setTokenEnv(event.target.value.trim())} placeholder="CMS_ACCESS_TOKEN" aria-invalid={!validTokenEnv} />
              <FieldDescription>The variable name in your project, not the token itself. Use a server-only variable.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="docs-env-file">Existing environment file</FieldLabel>
              <Input id="docs-env-file" value={envFile} onChange={(event) => setEnvFile(event.target.value.trim())} placeholder=".env.local" />
              <FieldDescription>Also reads .env. Leave blank to use only shell or CI variables.</FieldDescription>
            </Field>
          </div>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>Enable <code className="font-mono text-foreground">docs:read</code> on your existing token in <Link className="text-foreground underline underline-offset-4" href="/app/settings/auth">Auth settings</Link>. Its value stays the same.</li>
            <li>Download and extract the setup kit into your project. It includes the updater, tenant config, and instructions.</li>
            <li>Merge these scripts into your existing <code className="font-mono text-foreground">package.json</code>, then run the update command.</li>
          </ol>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs"><code>{JSON.stringify({ scripts: {
            "cms:docs": "node scripts/update-cms-docs.mjs",
            update_cms_documentation: "npm run cms:docs",
          } }, null, 2)}</code></pre>
          <div>
            <Button disabled={!tenantSlug || !validTokenEnv || pending !== null} onClick={() => exportIntegration("setup")}>
              {pending === "setup" ? <Loader2 className="animate-spin" /> : <Download />}
              Download Node setup kit
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Commit the generated docs, config, and updater. Keep your environment files gitignored.
            Use <code className="font-mono text-foreground">npm run cms:docs -- --check</code> to check for updates without writing files.
            Local edits to generated files are protected.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function EndpointCard({ endpoint, tenantSlug, token }: { endpoint: EndpointDefinition; tenantSlug: string; token: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [values, setValues] = useState<ParameterValues>(emptyValues);
  const [result, setResult] = useState<ApiResult | null>(null);
  const panelId = `endpoint-${endpoint.id}`;
  const relativeUrl = useMemo(() => buildRelativeUrl(endpoint, tenantSlug, values), [endpoint, tenantSlug, values]);
  const missingRequiredParameter = !tenantSlug || endpoint.pathParameters.some((parameter) => !values[parameter.key].trim());
  const curl = [
    `curl '${cmsPublicUrl}${relativeUrl}' \\`,
    `  -H 'Authorization: Bearer ${token.trim() || "cms_at_..."}'`,
  ].join("\n");

  function updateValue(key: keyof ParameterValues, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function execute() {
    setIsLoading(true);
    setResult(null);
    const startedAt = performance.now();

    try {
      const response = await fetch(relativeUrl, {
        headers: token.trim() ? { Authorization: `Bearer ${token.trim()}` } : undefined,
      });
      const responseText = await response.text();
      let body: unknown = responseText;
      try {
        body = responseText ? JSON.parse(responseText) : null;
      } catch {
        // Keep non-JSON responses readable in the result panel.
      }
      setResult({
        status: response.status,
        statusText: response.statusText,
        requestId: response.headers.get("x-request-id"),
        durationMs: Math.round(performance.now() - startedAt),
        url: new URL(relativeUrl, window.location.origin).toString(),
        body,
      });
    } catch (error) {
      setResult({
        status: null,
        statusText: "Request failed",
        requestId: null,
        durationMs: Math.round(performance.now() - startedAt),
        url: new URL(relativeUrl, window.location.origin).toString(),
        body: { error: error instanceof Error ? error.message : "The request could not be completed" },
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Badge className="mt-0.5 bg-emerald-700 text-white">GET</Badge>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <code className="break-all font-mono text-sm font-semibold">{endpoint.path}</code>
              <span className="text-sm font-medium text-muted-foreground">{endpoint.title}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{endpoint.description}</p>
          </div>
        </div>
        <Button
          variant={isOpen ? "secondary" : "outline"}
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => setIsOpen((open) => !open)}
        >
          {isOpen ? <X data-icon="inline-start" /> : <Play data-icon="inline-start" />}
          {isOpen ? "Close" : "Try"}
        </Button>
      </div>

      {isOpen ? (
        <div id={panelId} className="grid gap-5 border-t bg-muted/25 p-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="grid content-start gap-4">
              <div>
                <p className="mb-3 text-sm font-medium text-muted-foreground">Path parameters</p>
                <div className="grid gap-3">
                  <ReadOnlyParameter label="tenantSlug" value={tenantSlug} description="Selected tenant slug." />
                  {endpoint.pathParameters.map((parameter) => (
                    <Field key={parameter.key}>
                      <div className="flex items-center justify-between gap-3">
                        <FieldLabel htmlFor={`${endpoint.id}-${parameter.key}`} className="font-mono">{parameter.label}</FieldLabel>
                        <span className="text-xs text-muted-foreground">required</span>
                      </div>
                      <Input
                        id={`${endpoint.id}-${parameter.key}`}
                        className="font-mono"
                        value={values[parameter.key]}
                        placeholder={parameter.placeholder}
                        spellCheck={false}
                        onChange={(event) => updateValue(parameter.key, event.target.value)}
                      />
                      <FieldDescription>{parameter.description}</FieldDescription>
                    </Field>
                  ))}
                </div>
              </div>

              {endpoint.queryParameters.length ? (
                <div>
                  <p className="mb-3 text-sm font-medium text-muted-foreground">Query parameters</p>
                  <div className="grid gap-3">
                    {endpoint.queryParameters.map((parameter) => (
                      <Field key={parameter.key}>
                        <div className="flex items-center justify-between gap-3">
                          <FieldLabel htmlFor={`${endpoint.id}-${parameter.key}`} className="font-mono">{parameter.label}</FieldLabel>
                          <span className="text-xs text-muted-foreground">optional</span>
                        </div>
                        <Input
                          id={`${endpoint.id}-${parameter.key}`}
                          className="font-mono"
                          value={values[parameter.key]}
                          placeholder={parameter.placeholder}
                          spellCheck={false}
                          inputMode={parameter.key === "limit" || parameter.key === "maxDepth" ? "numeric" : undefined}
                          onChange={(event) => updateValue(parameter.key, event.target.value)}
                        />
                        <FieldDescription>{parameter.description}</FieldDescription>
                      </Field>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="grid content-start gap-4">
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-muted-foreground">Request preview</p>
                  <CopyButton value={curl} label="Copy cURL" />
                </div>
                <pre className="overflow-x-auto rounded-lg bg-inverse p-4 font-mono text-xs leading-relaxed text-inverse-foreground">{curl}</pre>
              </div>

              <Button disabled={isLoading || missingRequiredParameter} onClick={execute} className="justify-self-start">
                {isLoading ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Play data-icon="inline-start" />}
                {isLoading ? "Sending…" : "Send request"}
              </Button>
              {missingRequiredParameter ? <p className="-mt-2 text-xs text-muted-foreground">Complete the required path parameters to send this request.</p> : null}
            </div>
          </div>

          {result ? <ResponsePanel result={result} /> : null}
        </div>
      ) : null}
    </Card>
  );
}

function ReadOnlyParameter({ label, value, description }: { label: string; value: string; description: string }) {
  return (
    <Field>
      <div className="flex items-center justify-between gap-3">
        <FieldLabel className="font-mono">{label}</FieldLabel>
        <span className="text-xs text-muted-foreground">required</span>
      </div>
      <Input className="font-mono" value={value} readOnly aria-label={label} />
      <FieldDescription>{description}</FieldDescription>
    </Field>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied`);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("The browser could not copy this value");
    }
  }

  return (
    <Button variant="ghost" size="xs" onClick={copy}>
      {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

function ResponsePanel({ result }: { result: ApiResult }) {
  const isSuccess = result.status !== null && result.status >= 200 && result.status < 300;
  const statusLabel = result.status === null ? result.statusText : `${result.status} ${result.statusText}`.trim();
  const formattedBody = typeof result.body === "string" ? result.body : JSON.stringify(result.body, null, 2);

  return (
    <div aria-live="polite" className="grid gap-3 border-t pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-muted-foreground">Response</p>
          <Badge variant={isSuccess ? "default" : "destructive"} className={isSuccess ? "bg-emerald-700 text-white" : undefined}>{statusLabel}</Badge>
          <span className="text-xs text-muted-foreground">{result.durationMs} ms</span>
          {result.requestId ? <span className="font-mono text-xs text-muted-foreground">Request {result.requestId}</span> : null}
        </div>
        <CopyButton value={formattedBody} label="Copy response" />
      </div>
      <p className="break-all font-mono text-xs text-muted-foreground">{result.url}</p>
      <pre className="max-h-[32rem] overflow-auto rounded-lg bg-inverse p-4 font-mono text-xs leading-relaxed text-inverse-foreground">{formattedBody}</pre>
    </div>
  );
}

function buildRelativeUrl(endpoint: EndpointDefinition, tenantSlug: string, values: ParameterValues) {
  let path = endpoint.path.replace("{tenantSlug}", encodeURIComponent(tenantSlug));
  for (const parameter of endpoint.pathParameters) {
    path = path.replace(`{${parameter.key}}`, encodeURIComponent(values[parameter.key].trim()));
  }

  const query = new URLSearchParams();
  for (const parameter of endpoint.queryParameters) {
    const value = values[parameter.key].trim();
    if (value) query.set(parameter.key, value);
  }

  const queryString = query.toString();
  return queryString ? `${path}?${queryString}` : path;
}
