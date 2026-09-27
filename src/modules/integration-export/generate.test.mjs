import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import ts from "typescript";

import { createIntegrationArchive } from "./archive.ts";
import { generateIntegrationFiles } from "./generate.ts";

const articleId = "11111111-1111-4111-8111-111111111111";
const heroId = "22222222-2222-4222-8222-222222222222";
const ctaId = "33333333-3333-4333-8333-333333333333";
function field(key, type, extra = {}) {
  return { key, type, label: key, required: true, isList: false, isTitle: false, config: {}, targetModelIds: [], ...extra };
}
const fixture = {
  tenant: { name: "Example café", slug: "example" }, origin: "https://cms.example.invalid",
  models: [
    { id: articleId, slug: "article", name: "Article", status: "active", fields: [
      ...["text", "number", "boolean", "date", "time", "url", "slug", "rich_text", "asset"].map((type) => field(type, type)),
      field("enum", "enum", { config: { options: ["one", 2, { value: "three", label: "Three" }] } }),
      field("sections", "component", { isList: true, targetModelIds: [heroId, ctaId] }),
      field("hero", "component", { targetModelIds: [heroId] }),
      field("empty", "component"),
    ] },
    { id: heroId, slug: "hero", name: "Hero", status: "active", fields: [field("title", "text"), field("self", "component", { targetModelIds: [heroId] })] },
    { id: ctaId, slug: "cta", name: "CTA", status: "archived", fields: [field("label", "text")] },
  ],
};
const files = generateIntegrationFiles(fixture);
const schema = JSON.parse(files["models.schema.json"]);
const examples = JSON.parse(files["examples/responses.json"]);
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);

function assertValid(entry) {
  assert.equal(validate(entry), true, JSON.stringify(validate.errors));
}

test("schemas validate all field types, heterogeneous components, depth limits, missing fields and unavailable relations", () => {
  for (const sample of Object.values(examples.byModel)) {
    for (const entry of sample.compact.data) assertValid(entry);
    assertValid(sample.expanded.data);
    assertValid(sample.missingFields.data);
    assertValid(sample.unavailableRelations.data);
  }
  assert.equal(examples.byModel.article.compact.data[0].data.sections.length, 2);
  assert.equal(examples.byModel.hero.expanded.data.data.self.modelId, heroId);
  assert.equal("data" in examples.byModel.hero.expanded.data.data.self, false);
});

test("wire schema reflects pass-through primitive JSON and does not confuse editor required with delivered required", () => {
  const sample = structuredClone(examples.byModel.article.compact.data[0]);
  sample.data = { text: false, number: "legacy value", enum: "retired", rich_text: "legacy text", stale_key: { old: true } };
  assertValid(sample);
  const properties = schema.$defs.Entry_11111111111141118111111111111111.allOf[1].properties.data.properties;
  assert.equal(properties.number["x-cms-editorSchema"].type, "number");
  assert.deepEqual(properties.enum["x-cms-editorSchema"].enum, ["one", "2", "three"]);
  assert.equal(properties.hero["x-cms-requiredForPublish"], true);
});

test("time fields export minute-precision local time intent, examples and model types", () => {
  const properties = schema.$defs.Entry_11111111111141118111111111111111.allOf[1].properties.data.properties;
  const validateTime = ajv.compile(properties.time["x-cms-editorSchema"]);
  assert.equal(validateTime("00:00"), true);
  assert.equal(validateTime("23:59"), true);
  for (const value of ["24:00", "9:00", "09:00:00", "09:00Z", "09:00\n"]) assert.equal(validateTime(value), false);
  assert.equal(examples.byModel.article.compact.data[0].data.time, "09:00");
  assert.match(files["types.ts"], /"time"/);
});

test("schemas reject wrong envelopes, wrong model targets and malformed delivered assets", () => {
  const sample = structuredClone(examples.byModel.article.compact.data[0]);
  sample.status = "draft";
  assert.equal(validate(sample), false);
  sample.status = "published";
  sample.data.hero = { id: articleId, modelId: articleId };
  assert.equal(validate(sample), false);
  sample.data.hero = null;
  sample.data.asset = "raw-asset-id";
  assert.equal(validate(sample), false);
});

test("OpenAPI covers all four GET operations with resolvable schemas, security, limits and matching examples", () => {
  const spec = JSON.parse(files["openapi.json"]);
  assert.equal(spec.openapi, "3.1.0");
  assert.equal(Object.keys(spec.paths).length, 4);
  assert.equal(JSON.stringify(spec).includes("#/$defs/"), false);
  for (const [route, item] of Object.entries(spec.paths)) {
    const op = item.get;
    assert.deepEqual(op.security, [{ contentToken: [] }]);
    assert.equal(op.parameters.find((parameter) => parameter.name === "tenantSlug").required, true);
    assert.equal(op.responses[401].headers["WWW-Authenticate"].schema.const, "Bearer");
    const responseSchema = { ...op.responses[200].content["application/json"].schema, components: spec.components };
    const validateResponse = ajv.compile(responseSchema);
    if (route.endsWith("/entries")) {
      assert.equal(validateResponse(examples.byModel.article.compact), true, JSON.stringify(validateResponse.errors));
      assert.equal(validateResponse(examples.empty), true);
      assert.equal(op.parameters.find((parameter) => parameter.name === "limit").schema.maximum, 100);
    }
    if (route.endsWith("/{entryId}")) assert.equal(validateResponse(examples.byModel.article.expanded), true, JSON.stringify(validateResponse.errors));
  }
});

test("schema hash is stable across model/config key ordering, changes with contract, and supports empty or large tenants", () => {
  const hash = (input) => JSON.parse(generateIntegrationFiles(input)["manifest.json"]).schemaHash;
  const reversed = structuredClone(fixture);
  reversed.models.reverse();
  assert.equal(hash(reversed), hash(fixture));
  reversed.models[0].fields[0].label = "Different label";
  assert.notEqual(hash(reversed), hash(fixture));
  const empty = generateIntegrationFiles({ ...fixture, models: [] });
  assert.match(empty["INTEGRATION.md"], /No models exist/);
  ajv.compile(JSON.parse(empty["models.schema.json"]));
  const many = generateIntegrationFiles({ ...fixture, models: Array.from({ length: 105 }, (_, i) => ({
    ...fixture.models[0], id: `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`, slug: `model_${i}`, fields: [],
  })) });
  assert.equal(JSON.parse(many["manifest.json"]).models.length, 105);
});

test("archive is readable by standard tar, preserves UTF-8 exactly and disallows unsafe filenames", () => {
  const archive = createIntegrationArchive(files);
  const names = execFileSync("tar", ["-tzf", "-"], { input: archive, encoding: "utf8" }).trim().split("\n");
  assert.deepEqual(names, Object.keys(files));
  for (const [name, text] of Object.entries(files)) {
    assert.equal(execFileSync("tar", ["-xOzf", "-", name], { input: archive, encoding: "utf8" }), text);
  }
  assert.throws(() => createIntegrationArchive({ "../secret": "bad" }), /Invalid export filename/);
});

function writeBundle(directory, bundle) {
  for (const [name, text] of Object.entries(bundle)) {
    mkdirSync(path.dirname(path.join(directory, name)), { recursive: true });
    writeFileSync(path.join(directory, name), text);
  }
}

test("generated TypeScript client, types and examples compile for empty and populated tenants", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "cms-types-"));
  try {
    for (const bundle of [files, generateIntegrationFiles({ ...fixture, models: [] })]) {
      writeBundle(directory, bundle);
      const program = ts.createProgram(["client.ts", "types.ts", "examples/usage.ts"].map((name) => path.join(directory, name)), {
        noEmit: true, strict: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler, types: ["node"], typeRoots: [path.resolve("node_modules/@types")],
      });
      const errors = ts.getPreEmitDiagnostics(program);
      assert.deepEqual(errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n")), []);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

async function withClient(run) {
  const directory = mkdtempSync(path.join(tmpdir(), "cms-client-"));
  try {
    const js = ts.transpileModule(files["client.ts"], { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    const filename = path.join(directory, "client.mjs");
    writeFileSync(filename, js);
    await run(await import(pathToFileURL(filename).href));
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

test("client calls all endpoints and preserves opaque cursors, auth and abort signals without caching", async () => {
  await withClient(async ({ createCmsClient }) => {
    const requests = [];
    const replies = [
      { data: [] }, { data: { fields: [] } }, examples.byModel.article.expanded,
      { data: [examples.byModel.article.compact.data[0]], meta: { nextCursor: "opaque+/= cursor", maxDepth: 2 } },
      { data: [], meta: { nextCursor: null, maxDepth: 2 } },
    ];
    const client = createCmsClient({ origin: fixture.origin, tenantSlug: "tenant name", token: "test-token", fetch: async (url, init) => {
      requests.push({ url, init }); return Response.json(replies.shift());
    } });
    const signal = new AbortController().signal;
    await client.listModels(signal);
    await client.getModel("article/path");
    await client.getEntry("article", articleId, { maxDepth: 2 });
    const collected = [];
    for await (const entry of client.iterateEntries("article", { limit: 1, maxDepth: 2, signal })) collected.push(entry);
    assert.equal(collected.length, 1);
    assert.equal(requests[0].url.pathname, "/api/content/tenant%20name/models");
    assert.match(requests[1].url.pathname, /article%2Fpath$/);
    assert.equal(requests[4].url.searchParams.get("cursor"), "opaque+/= cursor");
    assert.equal(requests[4].url.searchParams.get("maxDepth"), "2");
    assert.equal(requests[4].init.signal, signal);
    for (const { init } of requests) {
      assert.equal(init.cache, "no-store"); assert.equal(init.redirect, "error");
      assert.equal(init.headers.Authorization, "Bearer test-token");
    }
  });
});

test("client surfaces API errors and malformed responses, rejects invalid limits and stops repeated cursors", async () => {
  await withClient(async ({ createCmsClient, CmsApiError }) => {
    const config = { origin: fixture.origin, tenantSlug: "example", token: "test-token" };
    const denied = createCmsClient({ ...config, fetch: async () => Response.json(examples.error, { status: 404, headers: { "x-request-id": "trace-123" } }) });
    await assert.rejects(denied.getEntry("article", articleId), (error) => error instanceof CmsApiError && error.code === "NOT_FOUND" && error.requestId === "trace-123" && error.status === 404);
    await assert.rejects(denied.listEntries("article", { limit: 101 }), /limit must/);
    const bad = createCmsClient({ ...config, fetch: async () => new Response("<html>unexpected</html>") });
    await assert.rejects(bad.listModels(), (error) => error.code === "INVALID_RESPONSE");
    const malformed = createCmsClient({ ...config, fetch: async () => Response.json({ data: [], meta: { maxDepth: 1 } }) });
    await assert.rejects(malformed.listEntries("article"), /metadata is invalid/);
    let calls = 0;
    const repeated = createCmsClient({ ...config, fetch: async () => {
      calls++; return Response.json({ data: [], meta: { nextCursor: "same", maxDepth: 1 } });
    } });
    await assert.rejects(async () => { for await (const entry of repeated.iterateEntries("article")) void entry; }, /repeated/);
    assert.equal(calls, 2);
  });
});
