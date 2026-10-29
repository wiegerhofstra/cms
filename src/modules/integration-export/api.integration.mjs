import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import nextEnv from "@next/env";
import pg from "pg";

import { createDocumentationSetup } from "./setup.ts";

// Opt-in: requires a running local app and its database. Fixtures are cascade-deleted.
test("documentation API: existing token grants, tenant isolation, revocation and real updater", { timeout: 60_000 }, async (t) => {
  nextEnv.loadEnvConfig(process.cwd());
  const origin = process.env.CMS_TEST_ORIGIN ?? "http://localhost:3012";
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname), "Use a local app for this test");
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const tenantId = randomUUID();
  const slug = `docs-test-${randomBytes(6).toString("hex")}`;
  const root = await mkdtemp(path.join(tmpdir(), "cms-docs-api-"));
  t.after(async () => {
    try { await db.query("DELETE FROM tenants WHERE id = $1", [tenantId]); } finally {
      await db.end();
      await rm(root, { recursive: true, force: true });
    }
  });
  await db.query("INSERT INTO tenants (id, slug, name) VALUES ($1, $2, 'Documentation test')", [tenantId, slug]);
  await db.query("INSERT INTO content_models (tenant_id, name, slug, status) VALUES ($1, 'Archived example', 'archived', 'archived')", [tenantId]);
  const secret = `cms_at_${randomBytes(32).toString("base64url")}`;
  const tokenHash = createHash("sha256").update(secret).digest("hex");
  const { rows: [token] } = await db.query("INSERT INTO access_tokens (tenant_id, name, token_hash, token_hint, permissions) VALUES ($1, 'Docs test', $2, 'test', ARRAY['content:read']) RETURNING id", [tenantId, tokenHash]);
  const request = (tokenValue = secret, tenant = slug) => fetch(`${origin}/api/integration/${tenant}/v1`, {
    headers: tokenValue ? { Authorization: `Bearer ${tokenValue}` } : {}, signal: AbortSignal.timeout(15_000),
  });
  const status = async (response) => { await response.arrayBuffer(); return response.status; };
  assert.equal(await status(await request(null)), 401);
  assert.equal(await status(await request("cms_at_unknown")), 401);
  assert.equal(await status(await request()), 403, "content:read alone must not grant docs");
  await db.query("UPDATE access_tokens SET permissions = ARRAY['content:read', 'docs:read'] WHERE id = $1", [token.id]);
  const granted = await request();
  assert.equal(granted.status, 200, "existing secret works after granting docs:read");
  assert.equal(granted.headers.get("cache-control"), "private, no-store");
  const payload = await granted.json();
  assert.equal(payload.tenantSlug, slug);
  assert.equal(JSON.parse(payload.files["manifest.json"]).models[0].status, "archived");
  assert.equal(JSON.stringify(payload).includes(secret), false);
  assert.equal(await status(await request(secret, `${slug}-other`)), 403);
  const content = () => fetch(`${origin}/api/content/${slug}/models`, { headers: { Authorization: `Bearer ${secret}` } });
  assert.equal(await status(await content()), 200, "content access remains available");

  const kit = await createDocumentationSetup(slug, origin, { tokenEnv: "CMS_DOCS_TEST_TOKEN", envFile: "" });
  for (const [name, body] of Object.entries(kit)) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), body);
  }
  const run = (args = []) => promisify(execFile)(process.execPath, [path.join(root, "scripts/update-cms-docs.mjs"), ...args], {
    cwd: root, env: { ...process.env, CMS_DOCS_TEST_TOKEN: secret }, timeout: 20_000,
  });
  assert.match((await run()).stdout, /Updated docs\/cms/);
  assert.match((await run(["--check"])).stdout, /up to date/);
  const before = await readFile(path.join(root, "docs/cms/INTEGRATION.md"), "utf8");
  await db.query("UPDATE access_tokens SET permissions = ARRAY['docs:read'] WHERE id = $1", [token.id]);
  assert.equal(await status(await content()), 403, "docs permission does not grant content access");
  assert.equal(await status(await request()), 200);
  await db.query("UPDATE access_tokens SET expires_at = now() - interval '1 minute' WHERE id = $1", [token.id]);
  assert.equal(await status(await request()), 401);
  await db.query("UPDATE access_tokens SET expires_at = NULL, revoked_at = now() WHERE id = $1", [token.id]);
  assert.equal(await status(await request()), 401);
  await assert.rejects(run(), (error) => error.code === 1 && /expired or revoked/.test(error.stderr));
  assert.equal(await readFile(path.join(root, "docs/cms/INTEGRATION.md"), "utf8"), before);
});
