import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import nextEnv from "@next/env";
import { eq, inArray } from "drizzle-orm";

const src = path.resolve("src");
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/cms/context") return { url: "test:consumer-context", shortCircuit: true };
    const candidate = specifier.startsWith("@/") ? path.join(src, specifier.slice(2)) :
      specifier.startsWith(".") && context.parentURL?.startsWith(pathToFileURL(`${src}/`).href) ? fileURLToPath(new URL(specifier, context.parentURL)) : null;
    if (candidate) for (const filename of [candidate, `${candidate}.ts`, path.join(candidate, "index.ts")]) {
      if (filename.endsWith(".ts") && existsSync(filename)) return { url: pathToFileURL(filename).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === "test:consumer-context") return { format: "module", shortCircuit: true, source: `
      export async function getCmsContext() { return globalThis.consumerTestContext; }
      export function requireAdmin(context) { if (context.user.role !== 'admin') throw new Error('Admin required'); }
    ` };
    return nextLoad(url, context);
  },
});
nextEnv.loadEnvConfig(process.cwd());

test("consumer settings isolate tenants and frameworks, preserve defaults, authorize actions, and track queued builds", async () => {
  const { db } = await import("../../db/index.ts");
  const { tenants, tenantRevalidationSettings } = await import("../../db/schema/index.ts");
  const service = await import("./service.ts");
  const ids = [crypto.randomUUID(), crypto.randomUUID()];
  const tenantId = ids[0];
  const requests = [];
  let fail = false;
  const server = createServer((req, res) => {
    requests.push({ method: req.method, url: req.url, auth: req.headers.authorization });
    if (req.method !== "POST") { res.writeHead(405, { Allow: "POST" }); res.end(); return; }
    res.writeHead(fail ? 500 : 200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ deployments: [{ resource_uuid: "app123", deployment_uuid: "deploy123" }] }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  globalThis.consumerTestContext = { user: { role: "admin" }, memberships: [] };
  try {
    const created = await db.insert(tenants).values(ids.map((id) => ({ id, name: "Consumer integration test", slug: `consumer-${id}` }))).returning();
    assert.ok(created.every((tenant) => tenant.consumerType === "nextjs"));
    await service.saveRevalidationSettings(tenantId, { url: `${base}/revalidate`, token: "next-secret" }, "nextjs");
    assert.deepEqual(Object.keys(await service.getRevalidationSettingsForAdmin(tenantId)).sort(), ["hasToken", "updatedAt", "url"]);
    await service.revalidateTenant(tenantId, "nextjs");
    assert.equal(requests[0].method, "POST");
    assert.equal(requests[0].auth, "Bearer next-secret");
    await service.saveConsumerType(tenantId, "astro");
    assert.equal((await service.getRevalidationStatus(tenantId)).configured, false);
    await assert.rejects(service.revalidateTenant(tenantId, "nextjs"), /consumer type changed/);
    await assert.rejects(service.saveRevalidationSettings(tenantId, { url: `${base}/revalidate`, token: "" }, "nextjs"), /consumer type changed/);
    await assert.rejects(service.saveRevalidationSettings(tenantId, { url: `${base}/api/v1/deploy?uuid=app123`, token: "" }, "astro"), /token is required/);
    await service.saveRevalidationSettings(tenantId, { url: `${base}/api/v1/deploy?uuid=app123`, token: "coolify-secret" }, "astro");
    await service.saveRevalidationSettings(tenantId, { url: `${base}/api/v1/deploy?uuid=app123`, token: "" }, "astro");
    await service.revalidateTenant(tenantId, "astro");
    assert.deepEqual(requests[1], { method: "POST", url: "/api/v1/deploy?uuid=app123&force=true", auth: "Bearer coolify-secret" });
    const status = await service.getRevalidationStatus(tenantId);
    assert.equal(status.lastDeploymentId, "deploy123");
    assert.ok(status.lastRevalidatedAt);
    fail = true;
    await assert.rejects(service.revalidateTenant(tenantId, "astro"), /HTTP 500/);
    assert.deepEqual(await service.getRevalidationStatus(tenantId), status);
    globalThis.consumerTestContext = { user: { role: "user" }, memberships: [{ tenantId: ids[1] }] };
    await assert.rejects(service.revalidateTenant(tenantId, "astro"), /do not have access/);
    await assert.rejects(service.saveConsumerType(tenantId, "nextjs"), /Admin required/);
    globalThis.consumerTestContext.memberships = [{ tenantId }];
    await assert.rejects(service.getRevalidationSettingsForAdmin(tenantId), /Admin required/);
    fail = false;
    await service.revalidateTenant(tenantId, "astro");
    globalThis.consumerTestContext = { user: { role: "admin" }, memberships: [] };
    await service.saveRevalidationSettings(tenantId, { url: "", token: "" }, "astro");
    assert.equal((await service.getRevalidationStatus(tenantId)).configured, false);
    await service.saveConsumerType(tenantId, "nextjs");
    assert.equal((await service.getRevalidationStatus(tenantId)).configured, true);
    await service.revalidateTenant(tenantId, "nextjs");
    assert.equal(requests.at(-1).auth, "Bearer next-secret");
    assert.equal((await db.select().from(tenantRevalidationSettings).where(eq(tenantRevalidationSettings.tenantId, tenantId))).length, 1);
    assert.equal((await service.getRevalidationStatus(ids[1])).configured, false);
  } finally {
    await db.delete(tenants).where(inArray(tenants.id, ids));
    delete globalThis.consumerTestContext;
    await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
  }
});
