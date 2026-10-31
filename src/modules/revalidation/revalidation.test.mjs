import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { test } from "node:test";

import { decryptRevalidationToken, encryptRevalidationToken } from "./credentials.ts";
import { requestRevalidation } from "./request.ts";
import { revalidationSettingsSchema } from "./validation.ts";

test("tokens are encrypted, authenticated, and bound to their tenant and server key", () => {
  const key = randomBytes(32).toString("base64");
  const token = "revalidation-secret";
  const encrypted = encryptRevalidationToken(token, "tenant-a", key);
  assert.equal(decryptRevalidationToken(encrypted, "tenant-a", key), token);
  assert.ok(!encrypted.includes(token));
  assert.notEqual(encrypted, encryptRevalidationToken(token, "tenant-a", key));
  assert.throws(() => decryptRevalidationToken(encrypted, "tenant-b", key));
  assert.throws(() => decryptRevalidationToken(encrypted, "tenant-a", randomBytes(32).toString("base64")));
  const parts = encrypted.split(":");
  const ciphertext = Buffer.from(parts[3], "base64");
  ciphertext[0] ^= 1;
  parts[3] = ciphertext.toString("base64");
  assert.throws(() => decryptRevalidationToken(parts.join(":"), "tenant-a", key));
});

test("settings accept HTTP(S), blank tokens for preservation, and clearing the URL", () => {
  assert.deepEqual(revalidationSettingsSchema.parse({ url: " https://example.com/api/revalidate ", token: " token " }), {
    url: "https://example.com/api/revalidate", token: "token",
  });
  assert.ok(revalidationSettingsSchema.safeParse({ url: "http://localhost:3000/api/revalidate", token: "" }).success);
  assert.ok(revalidationSettingsSchema.safeParse({ url: "", token: "" }).success);
  for (const url of ["/api/revalidate", "file:///etc/passwd", "ftp://example.com", "https://user:pass@example.com", "https://example.com/#fragment"]) {
    assert.equal(revalidationSettingsSchema.safeParse({ url, token: "token" }).success, false, url);
  }
  for (const token of ["token\r\nInjected: header", "token with spaces"]) {
    assert.equal(revalidationSettingsSchema.safeParse({ url: "https://example.com", token }).success, false);
  }
});

test("revalidation POST uses a bearer header and handles upstream failures without leaking bodies", async (t) => {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push({ url: request.url, method: request.method, authorization: request.headers.authorization });
    if (request.url === "/redirect") {
      response.writeHead(307, { Location: "/redirect-target" });
      response.end();
      return;
    }
    if (request.headers.authorization !== "Bearer correct-token") {
      response.writeHead(401);
      response.end("private upstream detail");
      return;
    }
    if (request.url === "/failure") {
      response.writeHead(500);
      response.end("private upstream detail");
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ revalidated: true }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  await requestRevalidation(`${base}/api/revalidate`, "correct-token");
  assert.deepEqual(requests[0], { url: "/api/revalidate", method: "POST", authorization: "Bearer correct-token" });
  await assert.rejects(requestRevalidation(`${base}/api/revalidate`, "wrong-token"), (error) => {
    assert.match(error.message, /HTTP 401/);
    assert.doesNotMatch(error.message, /private|wrong-token/);
    return true;
  });
  await assert.rejects(requestRevalidation(`${base}/failure`, "correct-token"), /HTTP 500/);
  await assert.rejects(requestRevalidation(`${base}/redirect`, "correct-token"), /could not be reached/);
  assert.equal(requests.some((request) => request.url === "/redirect-target"), false);
});

test("network failures produce an actionable error without the URL or token", async () => {
  await assert.rejects(requestRevalidation("http://127.0.0.1:1/api/revalidate", "private-token"), (error) => {
    assert.match(error.message, /could not be reached/);
    assert.doesNotMatch(error.message, /127\.0\.0\.1|private-token/);
    return true;
  });
});

test("Coolify webhook validation restricts deployments to one application and forces fresh content", async () => {
  const { coolifyDeployUrl, consumerTypeSchema } = await import("./validation.ts");
  const url = new URL(coolifyDeployUrl("https://coolify.example.com/api/v1/deploy?uuid=app-123&force=false"));
  assert.equal(url.searchParams.get("force"), "true");
  assert.ok(consumerTypeSchema.safeParse("astro").success);
  assert.ok(consumerTypeSchema.safeParse("nextjs").success);
  assert.equal(consumerTypeSchema.safeParse("other").success, false);
  for (const value of [
    "https://coolify.example.com/api/v1/deploy?tag=all",
    "https://coolify.example.com/api/v1/deploy?uuid=a,b",
    "https://coolify.example.com/api/v1/deploy?uuid=a&uuid=b",
    "https://coolify.example.com/api/v1/deploy?uuid=a&pr=1",
    "https://coolify.example.com/api/v1/deploy?uuid=a&token=secret",
    "https://coolify.example.com/api/v1/restart?uuid=a",
    "https://user:secret@coolify.example.com/api/v1/deploy?uuid=a",
    "file:///api/v1/deploy?uuid=a",
  ]) assert.throws(() => coolifyDeployUrl(value), undefined, value);
});

test("Coolify only confirms a matching queued deployment and does not follow redirects or leak responses", async (t) => {
  const { requestCoolifyBuild } = await import("./coolify.ts");
  const requests = [];
  let mode = "ok";
  const server = createServer((req, res) => {
    requests.push({ url: req.url, method: req.method, auth: req.headers.authorization });
    if (req.method !== "POST") { res.writeHead(405, { Allow: "POST" }); res.end(); return; }
    if (mode === "redirect") { res.writeHead(302, { Location: "/redirect-target" }); res.end(); return; }
    if (mode === "unauthorized") { res.writeHead(401); res.end("private-token"); return; }
    if (mode === "html") { res.end("<html>login private-token</html>"); return; }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ deployments: mode === "empty" ? [] : [{
      resource_uuid: mode === "wrong-resource" ? "other" : "app123",
      deployment_uuid: mode === "invalid-id" ? "<html>private-token</html>" : "build123",
    }] }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const webhook = `http://127.0.0.1:${server.address().port}/api/v1/deploy?uuid=app123&force=false`;
  assert.equal(await requestCoolifyBuild(webhook, "private-token"), "build123");
  assert.deepEqual(requests[0], { url: "/api/v1/deploy?uuid=app123&force=true", method: "POST", auth: "Bearer private-token" });
  for (mode of ["empty", "html", "wrong-resource", "invalid-id", "unauthorized", "redirect"]) {
    await assert.rejects(requestCoolifyBuild(webhook, "private-token"), (error) => {
      assert.doesNotMatch(error.message, /private-token|<html>/);
      assert.match(error.message, /Coolify/);
      return true;
    });
  }
  assert.equal(requests.some((req) => req.url === "/redirect-target"), false);
});
