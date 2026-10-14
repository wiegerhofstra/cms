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
