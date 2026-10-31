import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { AssetByteCache, OriginBusyError, OriginLimiter, assetCacheKey, retryOrigin } from "./byte-cache.ts";

const asset = { tenantId: "tenant", id: "asset", bucket: "bucket", objectKey: "key", etag: "etag", sizeBytes: 5 };
async function cache(t, maxBytes = 20) {
  const directory = await mkdtemp(path.join(tmpdir(), "cms-asset-cache-"));
  t.after(() => rm(directory, { force: true, recursive: true }));
  return new AssetByteCache(directory, maxBytes, 10);
}
async function contents(result) {
  try { return await result.file.readFile("utf8"); }
  finally { await result.file.close(); }
}

test("concurrent cold reads share one download and persist across cache instances", async (t) => {
  const storage = await cache(t);
  let calls = 0;
  const fill = async (destination) => { calls++; await delay(20); await writeFile(destination, "hello"); };
  const reads = await Promise.all(Array.from({ length: 12 }, () => storage.get(asset, fill)));
  assert.equal(calls, 1);
  assert.equal(reads.filter((read) => read.status === "MISS").length, 1);
  assert.ok(reads.some((read) => read.status === "COALESCED"));
  assert.deepEqual(await Promise.all(reads.map(contents)), Array(12).fill("hello"));
  const restarted = new AssetByteCache(storage.directory, 20, 10);
  const hit = await restarted.get(asset, () => assert.fail("warm read reached origin"));
  assert.equal(hit.status, "HIT");
  assert.equal(await contents(hit), "hello");
});

test("tenant, object version, and asset identity all isolate cached bytes", async (t) => {
  const storage = await cache(t);
  const keys = [asset, { ...asset, tenantId: "other" }, { ...asset, etag: "other" }, { ...asset, objectKey: "other" }, { ...asset, id: "other" }].map(assetCacheKey);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(await contents(await storage.get(asset, (file) => writeFile(file, "hello"))), "hello");
  assert.equal(await contents(await storage.get({ ...asset, tenantId: "other" }, (file) => writeFile(file, "world"))), "world");
});

test("partial files and failures are not cached; a subsequent request can recover", async (t) => {
  const storage = await cache(t);
  await assert.rejects(storage.get(asset, async (file) => { await writeFile(file, "he"); throw new Error("connection failed"); }), /connection failed/);
  assert.deepEqual(await readdir(storage.directory), []);
  await assert.rejects(storage.get(asset, (file) => writeFile(file, "he")), /byte length/);
  assert.deepEqual(await readdir(storage.directory), []);
  assert.equal(await contents(await storage.get(asset, (file) => writeFile(file, "hello"))), "hello");
});

test("eviction bounds completed files without breaking an already-open response", async (t) => {
  const storage = await cache(t, 5);
  const first = await storage.get(asset, (file) => writeFile(file, "hello"));
  const second = await storage.get({ ...asset, id: "new" }, (file) => writeFile(file, "world"));
  assert.equal(await contents(first), "hello");
  assert.equal(await contents(second), "world");
  const names = await readdir(storage.directory);
  assert.equal(names.length, 1);
  assert.equal((await readFile(path.join(storage.directory, names[0]))).length, 5);
  assert.equal(storage.canCache(6), false);
});

test("concurrent commits stay within disk budget and abandoned files are reclaimed", async (t) => {
  const storage = await cache(t, 10);
  const results = await Promise.allSettled(Array.from({ length: 8 }, (_, id) => storage.get({ ...asset, id: String(id) }, (file) => writeFile(file, "hello"))));
  for (const result of results) {
    if (result.status === "fulfilled") await result.value.file.close();
    else assert.ok(result.reason instanceof OriginBusyError);
  }
  const files = await readdir(storage.directory);
  assert.ok(files.filter((name) => name.endsWith(".bin")).length <= 2);
  assert.ok(!files.some((name) => name.endsWith(".tmp")));
});

test("origin concurrency and queue size are bounded, timed out slots are removed", async () => {
  const limiter = new OriginLimiter(1, 1, 20);
  const release = await limiter.acquire();
  const waiting = limiter.acquire();
  const timedOut = assert.rejects(waiting, OriginBusyError);
  await assert.rejects(limiter.acquire(), OriginBusyError);
  await timedOut;
  release(); release();
  const again = await limiter.acquire();
  const next = limiter.acquire();
  again();
  (await next)();
});

test("origin retry handles transient errors, stops at its bound, and never retries forbidden/missing files", async () => {
  let calls = 0;
  assert.equal(await retryOrigin(async () => {
    if (++calls < 3) throw { $metadata: { httpStatusCode: 503 } };
    return "ok";
  }, { delayMs: 0 }), "ok");
  assert.equal(calls, 3);
  for (const status of [403, 404, 500, 429]) {
    calls = 0;
    await assert.rejects(retryOrigin(async () => { calls++; throw Object.assign(new Error("origin"), { $metadata: { httpStatusCode: status } }); }, { delayMs: 0 }));
    assert.equal(calls, status < 429 ? 1 : 3);
  }
  calls = 0;
  await assert.rejects(retryOrigin(async (signal) => {
    calls++;
    await delay(100, undefined, { signal });
  }, { delayMs: 0, timeoutMs: 5, attempts: 2 }));
  assert.equal(calls, 2);
});
