import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

import { CmsError } from "../../lib/cms/errors.ts";
import { accessTokenPermissionsSchema } from "../access-tokens/permissions.ts";
import { handleDocumentationRequest } from "./api.ts";
import { generateIntegrationFiles } from "./generate.ts";
import { createDocumentationSetup } from "./setup.ts";
import { createDocumentationSnapshot } from "./snapshot.ts";

const exec = promisify(execFile);
const fixture = { tenant: { name: "Example", slug: "example", defaultLocale: "en", locales: ["en"] }, origin: "https://cms.fourd.nl", models: [] };
const exported = generateIntegrationFiles(fixture);
const snapshot = (files = exported) => createDocumentationSnapshot("example", files);

test("sync hashes cover guide/client changes and ignore only the export timestamp", () => {
  const manifest = JSON.parse(exported["manifest.json"]);
  const later = { ...exported, "manifest.json": JSON.stringify({ ...manifest, generatedAt: "2100-01-01T00:00:00Z" }) };
  assert.deepEqual(snapshot(later), snapshot());
  assert.notEqual(snapshot({ ...exported, "INTEGRATION.md": "Updated guide" }).contentHash, snapshot().contentHash);
  assert.notEqual(snapshot({ ...exported, "client.ts": "Updated client" }).contentHash, snapshot().contentHash);
  assert.ok(manifest.generatedAt, "manual bundles retain timestamps");
});

test("docs permission coexists with existing permissions and rejects unknown grants", () => {
  assert.deepEqual(accessTokenPermissionsSchema.parse(["content:read", "email:send", "docs:read"]), ["content:read", "email:send", "docs:read"]);
  assert.equal(accessTokenPermissionsSchema.safeParse(["docs:write"]).success, false);
});

test("documentation handler authenticates before export and uses the authenticated tenant", async () => {
  let called = false;
  const response = await handleDocumentationRequest(new Request("https://cms.test"), "example", {
    authenticate: async (_request, slug, permission) => {
      assert.equal(slug, "example"); assert.equal(permission, "docs:read");
      return { tenantSlug: "example" };
    },
    exportFiles: async (slug) => { called = true; assert.equal(slug, "example"); return exported; },
  });
  assert.equal(called, true);
  assert.deepEqual(await response.json(), snapshot());
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  for (const code of ["UNAUTHORIZED", "FORBIDDEN"]) {
    const denied = await handleDocumentationRequest(new Request("https://cms.test"), "example", {
      authenticate: async () => { throw new CmsError(code, "Denied"); },
      exportFiles: async () => { assert.fail("Must not export after failed authentication"); },
    });
    assert.equal(denied.status, code === "UNAUTHORIZED" ? 401 : 403);
    assert.equal(denied.headers.get("cache-control"), "private, no-store");
    assert.equal(denied.headers.get("www-authenticate"), code === "UNAUTHORIZED" ? "Bearer" : null);
  }
});

async function project(t) {
  const root = await mkdtemp(path.join(tmpdir(), "cms-docs-test-"));
  const state = { response: snapshot(), status: 200, headers: {}, requests: [] };
  const server = createServer((request, response) => {
    state.requests.push({ url: request.url, authorization: request.headers.authorization });
    response.writeHead(state.status, { "Content-Type": "application/json", ...state.headers });
    response.end(JSON.stringify(state.response));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await rm(root, { recursive: true, force: true }); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const kit = await createDocumentationSetup("example", origin, { tokenEnv: "CMS_DOCS_TEST_ACCESS_TOKEN", envFile: ".env.local" });
  for (const [name, body] of Object.entries(kit)) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), body);
  }
  const config = JSON.parse(kit["cms-docs.config.json"]);
  const run = async (args = [], env = { CMS_DOCS_TEST_ACCESS_TOKEN: "cms_at_test" }) => {
    const childEnv = { ...process.env, ...env };
    if (env.CMS_DOCS_TEST_ACCESS_TOKEN === null) delete childEnv.CMS_DOCS_TEST_ACCESS_TOKEN;
    try {
      const result = await exec(process.execPath, [path.join(root, "scripts/update-cms-docs.mjs"), ...args], { cwd: tmpdir(), env: childEnv });
      return { ...result, code: 0 };
    } catch (error) { return { code: error.code, stdout: error.stdout, stderr: error.stderr }; }
  };
  return { root, state, config, run, output: path.join(root, "docs/cms"), saveConfig: () => writeFile(path.join(root, "cms-docs.config.json"), JSON.stringify(config)) };
}

test("downloaded kit updates, checks without writes, preserves notes and removes obsolete managed files", async (t) => {
  const p = await project(t);
  assert.equal((await p.run(["--check"])).code, 1);
  assert.equal((await readdir(p.root)).includes("docs"), false, "check must not even create the output parent");
  assert.equal((await p.run()).code, 0);
  assert.deepEqual(p.state.requests[0], { url: "/api/integration/example/v1", authorization: "Bearer cms_at_test" });
  const before = await readFile(path.join(p.output, ".cms-docs-state.json"), "utf8");
  assert.equal((await p.run(["--check"])).code, 0);
  assert.match((await p.run()).stdout, /up to date/);
  assert.equal(await readFile(path.join(p.output, ".cms-docs-state.json"), "utf8"), before);
  await writeFile(path.join(p.output, "notes.md"), "My notes");
  const changed = { ...exported, "INTEGRATION.md": "Updated guide" };
  delete changed["client.ts"];
  p.state.response = snapshot(changed);
  assert.equal((await p.run(["--check"])).code, 1);
  assert.equal(await readFile(path.join(p.output, "INTEGRATION.md"), "utf8"), exported["INTEGRATION.md"]);
  assert.equal((await p.run()).code, 0);
  assert.equal(await readFile(path.join(p.output, "INTEGRATION.md"), "utf8"), "Updated guide");
  assert.equal(await readFile(path.join(p.output, "notes.md"), "utf8"), "My notes");
  assert.equal((await readdir(p.output)).includes("client.ts"), false);
});

test("updater protects local edits, unmanaged collisions, symlinks and concurrent updates", async (t) => {
  const p = await project(t);
  assert.equal((await p.run()).code, 0);
  await writeFile(path.join(p.output, "INTEGRATION.md"), "Local edit");
  const result = await p.run();
  assert.equal(result.code, 1); assert.match(result.stderr, /Local documentation edits/);
  assert.equal(await readFile(path.join(p.output, "INTEGRATION.md"), "utf8"), "Local edit");
  await writeFile(path.join(p.output, "INTEGRATION.md"), exported["INTEGRATION.md"]);
  await mkdir(`${p.output}.lock`);
  assert.match((await p.run()).stderr, /Another update/);
  await rm(`${p.output}.lock`, { recursive: true });
  await symlink(path.join(p.root, "cms-docs.config.json"), path.join(p.output, "linked.json"));
  assert.match((await p.run()).stderr, /symlinks/);
  await rm(path.join(p.output, "linked.json"));
  await writeFile(path.join(p.output, "custom.ts"), "Manual file");
  p.state.response = snapshot({ ...exported, "custom.ts": "Generated file" });
  assert.match((await p.run()).stderr, /Local documentation edits/);
  assert.equal(await readFile(path.join(p.output, "custom.ts"), "utf8"), "Manual file");
});

test("invalid downloads and authorization failures leave the previous docs intact", async (t) => {
  const p = await project(t);
  assert.equal((await p.run()).code, 0);
  const before = await readFile(path.join(p.output, ".cms-docs-state.json"), "utf8");
  for (const status of [401, 403, 500, 302]) {
    p.state.status = status;
    p.state.headers = status === 302 ? { Location: "/elsewhere" } : {};
    assert.equal((await p.run()).code, 1);
  }
  p.state.status = 200; p.state.headers = {};
  for (const invalid of [
    { ...snapshot(), version: 2 },
    { ...snapshot(), tenantSlug: "other" },
    { ...snapshot(), contentHash: "bad" },
    snapshot({ ...exported, "../escape.md": "escape" }),
    snapshot({ ...exported, "/absolute.md": "escape" }),
    snapshot({ ...exported, "examples\\escape.md": "escape" }),
    snapshot({ ...exported, "integration.md": "collision" }),
    snapshot({ ...exported, "examples": "file vs directory" }),
  ]) {
    p.state.response = invalid;
    assert.equal((await p.run()).code, 1);
    assert.equal(await readFile(path.join(p.output, ".cms-docs-state.json"), "utf8"), before);
  }
  assert.equal((await readdir(p.root)).includes("escape.md"), false);
});

test("environment reuse honors shell precedence and configured file precedence", async (t) => {
  const p = await project(t);
  await writeFile(path.join(p.root, ".env"), "CMS_DOCS_TEST_ACCESS_TOKEN=cms_at_base\n");
  await writeFile(path.join(p.root, ".env.local"), "CMS_DOCS_TEST_ACCESS_TOKEN=cms_at_local\n");
  assert.equal((await p.run([], { CMS_DOCS_TEST_ACCESS_TOKEN: null })).code, 0);
  assert.equal(p.state.requests.at(-1).authorization, "Bearer cms_at_local");
  assert.equal((await p.run()).code, 0);
  assert.equal(p.state.requests.at(-1).authorization, "Bearer cms_at_test");
  p.config.envFiles = []; await p.saveConfig();
  assert.equal((await p.run([], { CMS_DOCS_TEST_ACCESS_TOKEN: null })).code, 1);
  assert.equal((await readFile(path.join(p.output, ".cms-docs-state.json"), "utf8")).includes("cms_at_"), false);
});

test("configuration cannot escape the project or transmit tokens over remote HTTP", async (t) => {
  const p = await project(t);
  for (const output of [".", "../outside", "/tmp/outside", ".git", "docs/../../outside", "docs\\cms"]) {
    p.config.output = output; await p.saveConfig();
    assert.equal((await p.run()).code, 1);
  }
  p.config.output = "docs/cms";
  p.config.origin = "http://cms.fourd.nl"; await p.saveConfig();
  assert.equal((await p.run()).code, 1);
  assert.equal(p.state.requests.length, 0);
  await assert.rejects(createDocumentationSetup("example", fixture.origin, { tokenEnv: "bad variable" }));
  await assert.rejects(createDocumentationSetup("example", fixture.origin, { envFile: "../.env" }));
});

test("staging failure preserves the complete existing output", async (t) => {
  const p = await project(t);
  assert.equal((await p.run()).code, 0);
  await mkdir(path.join(p.output, "new.ts"));
  await writeFile(path.join(p.output, "new.ts", "notes.md"), "Keep this");
  p.state.response = snapshot({ ...exported, "INTEGRATION.md": "New guide", "new.ts": "Conflicts with a directory" });
  assert.equal((await p.run()).code, 1);
  assert.equal(await readFile(path.join(p.output, "INTEGRATION.md"), "utf8"), exported["INTEGRATION.md"]);
  assert.equal(await readFile(path.join(p.output, "new.ts", "notes.md"), "utf8"), "Keep this");
  const state = JSON.parse(await readFile(path.join(p.output, ".cms-docs-state.json"), "utf8"));
  assert.equal(state.files["INTEGRATION.md"], createHash("sha256").update(exported["INTEGRATION.md"]).digest("hex"));
});
