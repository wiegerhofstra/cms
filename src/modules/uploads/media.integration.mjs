import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import nextEnv from "@next/env";
import pg from "pg";
import { assetCacheKey } from "./byte-cache.ts";

const src = path.resolve("src");
registerHooks({ resolve(specifier, context, nextResolve) {
  const candidate = specifier.startsWith("@/") ? path.join(src, specifier.slice(2)) :
    specifier.startsWith(".") && context.parentURL?.startsWith(pathToFileURL(`${src}/`).href) ? fileURLToPath(new URL(specifier, context.parentURL)) : null;
  if (candidate) for (const filename of [candidate, `${candidate}.ts`, path.join(candidate, "index.ts")]) {
    if (filename.endsWith(".ts") && existsSync(filename)) return { url: pathToFileURL(filename).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
} });
nextEnv.loadEnvConfig(process.cwd());

// Real route + database + disk + AWS SDK, against a local fake S3. No real S3 requests.
test("cached media delivery, range reads, failures and live capability revocation", { timeout: 60_000 }, async (t) => {
  const localOrigin = process.env.CMS_TEST_ORIGIN;
  if (localOrigin) assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(localOrigin).hostname));
  const deployedCacheDirectory = path.resolve(process.env.ASSET_CACHE_DIR ?? ".cache/assets");
  const directory = await mkdtemp(path.join(tmpdir(), "cms-media-integration-"));
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const tenantId = randomUUID(), assetId = randomUUID(), largeId = randomUUID(), partialId = randomUUID(), failureId = randomUUID();
  const payload = Buffer.from("%PDF-1.4\nSynthetic cached document for integration tests.\n");
  const objects = new Map([[assetId, payload], [largeId, Buffer.alloc(2048, "x")], [partialId, payload], [failureId, payload]]);
  const reads = new Map();
  let unavailable = false;
  const origin = createServer((request, response) => {
    const id = new URL(request.url, "http://localhost").pathname.split("/").at(-1);
    const count = (reads.get(id) ?? 0) + 1;
    reads.set(id, count);
    if (id === failureId) {
      response.writeHead(403, { "Content-Type": "application/xml" });
      response.end("<Error><Code>AccessDenied</Code></Error>"); return;
    }
    if (unavailable || (id === assetId && count === 1)) {
      response.writeHead(503, { "Content-Type": "application/xml" });
      response.end("<Error><Code>SlowDown</Code></Error>"); return;
    }
    const body = objects.get(id);
    if (!body) { response.writeHead(404); response.end(); return; }
    const range = /^bytes=(\d+)-(\d+)$/.exec(request.headers.range ?? "");
    const selected = range ? body.subarray(Number(range[1]), Number(range[2]) + 1) : body;
    response.writeHead(range ? 206 : 200, {
      "Content-Length": selected.length, "Content-Type": "application/pdf",
      ...(range ? { "Content-Range": `bytes ${range[1]}-${range[2]}/${body.length}` } : {}),
    });
    if (id === partialId && count === 1) {
      response.write(selected.subarray(0, 4));
      setTimeout(() => response.destroy(), 5);
    } else response.end(selected);
  });
  await new Promise((resolve) => origin.listen(0, "127.0.0.1", resolve));
  Object.assign(process.env, {
    S3_ENDPOINT: `http://127.0.0.1:${origin.address().port}`, S3_REGION: "us-east-1",
    S3_ACCESS_KEY_ID: "synthetic-key", S3_SECRET_ACCESS_KEY: "synthetic-secret",
    ASSET_CACHE_DIR: directory, ASSET_CACHE_MAX_BYTES: "4096", ASSET_CACHE_MAX_OBJECT_BYTES: "1024", ASSET_ORIGIN_CONCURRENCY: "2",
  });
  const { GET: media } = await import("../../app/api/media/[tenantId]/[assetId]/[token]/route.ts");
  const { getDeliveryAsset } = await import("../content-delivery/service.ts");
  const { assetDownloadToken } = await import("./download-token.ts");
  const secret = process.env.BETTER_AUTH_SECRET;
  const params = (id = assetId) => ({ tenantId, assetId: id, token: assetDownloadToken(secret, tenantId, id) });
  const request = (id = assetId, init = {}, overrides = {}) => {
    const parameters = { ...params(id), ...overrides };
    const url = `http://localhost/api/media/${parameters.tenantId}/${parameters.assetId}/${parameters.token}`;
    return media(new Request(url, init), { params: Promise.resolve(parameters) });
  };
  let liveCacheFile;
  t.after(async () => {
    globalThis.cmsMediaS3Client?.destroy();
    origin.closeAllConnections();
    await new Promise((resolve) => origin.close(resolve));
    await db.query("DELETE FROM tenants WHERE id = $1", [tenantId]);
    await db.end();
    await globalThis.cmsPool?.end();
    await rm(directory, { recursive: true, force: true });
    if (liveCacheFile) await rm(liveCacheFile, { force: true });
  });
  await db.query("INSERT INTO tenants (id, slug, name) VALUES ($1, $2, 'Media cache test')", [tenantId, `media-${tenantId}`]);
  for (const [id, body] of objects) await db.query("INSERT INTO assets (id, tenant_id, bucket, object_key, original_name, mime_type, size_bytes, status) VALUES ($1, $2, 'synthetic', $1::uuid::text, 'example.pdf', 'application/pdf', $3, 'ready')", [id, tenantId, body.length]);

  await t.test("content delivery returns stable CMS URLs; HEAD does not fetch S3", async () => {
    const first = await getDeliveryAsset(tenantId, assetId);
    const second = await getDeliveryAsset(tenantId, assetId);
    assert.equal(first.url, first.downloadUrl);
    assert.equal(first.url, second.url);
    assert.equal(new URL(first.url).pathname, `/api/media/${tenantId}/${assetId}/${params().token}`);
    const head = await request(assetId, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get("content-length"), String(payload.length));
    assert.equal(await head.text(), "");
    assert.equal(reads.size, 0);
  });

  await t.test("concurrent cold requests coalesce and retry a 503; warm reads survive origin failure", async () => {
    const responses = await Promise.all(Array.from({ length: 8 }, () => request()));
    for (const response of responses) {
      assert.equal(response.status, 200);
      assert.equal(await response.text(), payload.toString());
    }
    assert.equal(reads.get(assetId), 2, "one failed attempt then one shared successful download");
    unavailable = true;
    const warm = await request();
    assert.equal(warm.headers.get("x-asset-cache"), "HIT");
    assert.equal(await warm.text(), payload.toString());
    assert.equal(reads.get(assetId), 2);
    unavailable = false;
  });

  await t.test("range and conditional reads use cached bytes and never contact S3", async () => {
    const ranged = await request(assetId, { headers: { Range: "bytes=5-12" } });
    assert.equal(ranged.status, 206);
    assert.equal(ranged.headers.get("content-range"), `bytes 5-12/${payload.length}`);
    assert.equal(await ranged.text(), payload.subarray(5, 13).toString());
    const conditional = await request(assetId, { headers: { "If-None-Match": ranged.headers.get("etag") } });
    assert.equal(conditional.status, 304);
    assert.equal(await conditional.text(), "");
    assert.equal((await request(assetId, { headers: { Range: "bytes=9999-" } })).status, 416);
    assert.equal(reads.get(assetId), 2);
  });

  await t.test("incomplete bodies retry without publishing partial bytes; forbidden responses are not retried/cached", async () => {
    const repaired = await request(partialId);
    assert.equal(repaired.status, 200);
    assert.equal(await repaired.text(), payload.toString());
    assert.equal(reads.get(partialId), 2);
    const forbidden = await request(failureId);
    assert.equal(forbidden.status, 502);
    assert.equal(forbidden.headers.get("cache-control"), "private, no-store");
    assert.equal(reads.get(failureId), 1);
    assert.ok(!(await readdir(directory)).some((name) => name.endsWith(".tmp")));
  });

  await t.test("oversized assets stream with ranges without occupying the disk cache", async () => {
    const before = await readdir(directory);
    const response = await request(largeId, { headers: { Range: "bytes=100-199" } });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("x-asset-cache"), "BYPASS");
    assert.equal((await response.arrayBuffer()).byteLength, 100);
    assert.deepEqual(await readdir(directory), before);
  });

  if (localOrigin) await t.test("running Next app serves cached bytes, HEAD, ranges and conditional responses", async () => {
    liveCacheFile = path.join(deployedCacheDirectory, `${assetCacheKey({ tenantId, id: assetId, bucket: "synthetic", objectKey: assetId, etag: null, sizeBytes: payload.length })}.bin`);
    await mkdir(deployedCacheDirectory, { recursive: true, mode: 0o700 });
    await writeFile(liveCacheFile, payload, { flag: "wx", mode: 0o600 });
    const url = new URL(`/api/media/${tenantId}/${assetId}/${params().token}`, localOrigin);
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-asset-cache"), "HIT");
    assert.equal(await response.text(), payload.toString());
    const head = await fetch(url, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
    const ranged = await fetch(url, { headers: { Range: "bytes=0-3" } });
    assert.equal(ranged.status, 206);
    assert.equal(await ranged.text(), "%PDF");
    assert.equal((await fetch(url, { headers: { "If-None-Match": head.headers.get("etag") } })).status, 304);
  });

  await t.test("tampering, cross-tenant requests, rotation, pending and deleted assets cannot read warm cache", async () => {
    assert.equal((await request(assetId, {}, { token: "invalid" })).status, 404);
    assert.equal((await request(assetId, {}, { tenantId: randomUUID() })).status, 404);
    process.env.BETTER_AUTH_SECRET = "rotated-signing-secret-for-integration-testing";
    try { assert.equal((await request()).status, 404); }
    finally { process.env.BETTER_AUTH_SECRET = secret; }
    await db.query("UPDATE assets SET status = 'pending' WHERE id = $1", [assetId]);
    assert.equal((await request()).status, 404);
    await db.query("UPDATE assets SET status = 'deleted', deleted_at = now() WHERE id = $1", [assetId]);
    assert.equal((await request(assetId, { headers: { "If-None-Match": "*" } })).status, 404);
    await assert.rejects(getDeliveryAsset(tenantId, assetId), /not found/);
    if (localOrigin) {
      const response = await fetch(new URL(`/api/media/${tenantId}/${assetId}/${params().token}`, localOrigin), { headers: { "If-None-Match": "*" } });
      assert.equal(response.status, 404);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
    }
  });
});
