import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer as createTcpServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:tls";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import nextEnv from "@next/env";
import pg from "pg";

import { encryptEmailPassword } from "./credentials.ts";

// Opt-in command: starts the built app and uses temporary, cascade-deleted DB fixtures.
test("email API integration: tenant isolation, permissions, TLS SMTP, disabled settings and shared rate limits", { timeout: 90_000 }, async (t) => {
  nextEnv.loadEnvConfig(process.cwd());
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const tenantIds = [randomUUID(), randomUUID()];
  const slug = `email-test-${randomBytes(6).toString("hex")}`;
  const directory = mkdtempSync(join(tmpdir(), "cms-email-test-"));
  const certificate = join(directory, "cert.pem");
  const keyPath = join(directory, "key.pem");
  const encryptionKey = randomBytes(32).toString("base64");
  let app;
  let smtp;
  const sockets = new Set();
  t.after(async () => {
    if (app && app.exitCode === null) {
      app.kill("SIGTERM");
      await Promise.race([new Promise((resolve) => app.once("exit", resolve)), delay(3000)]);
      if (app.exitCode === null) app.kill("SIGKILL");
    }
    for (const socket of sockets) socket.destroy();
    if (smtp) await new Promise((resolve) => smtp.close(resolve));
    await db.query("DELETE FROM tenants WHERE id = ANY($1::uuid[])", [tenantIds]);
    await db.end();
    rmSync(directory, { recursive: true, force: true });
  });

  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyPath, "-out", certificate, "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost", "-addext", "basicConstraints=critical,CA:TRUE"], { stdio: "ignore" });
  const received = [];
  smtp = createServer({ key: readFileSync(keyPath), cert: readFileSync(certificate) }, (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    socket.setEncoding("utf8");
    socket.write("220 localhost test SMTP\r\n");
    let buffer = "";
    let data = null;
    let authenticated = false;
    socket.on("data", (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 2);
        if (data !== null) {
          if (line === ".") { received.push(data.join("\r\n")); data = null; socket.write("250 queued\r\n"); }
          else data.push(line.replace(/^\.\./, "."));
        } else if (/^EHLO /i.test(line)) socket.write("250-localhost\r\n250 AUTH PLAIN\r\n");
        else if (/^AUTH PLAIN /i.test(line)) {
          authenticated = Buffer.from(line.slice(11), "base64").toString() === "\0smtp-user\0smtp-password";
          socket.write(authenticated ? "235 authenticated\r\n" : "535 authentication failed\r\n");
        } else if (!authenticated) socket.write("530 authentication required\r\n");
        else if (/^MAIL FROM:/i.test(line)) socket.write("250 sender OK\r\n");
        else if (/^RCPT TO:/i.test(line)) socket.write(line.includes("reject@example.com") ? "550 recipient rejected\r\n" : "250 recipient OK\r\n");
        else if (line === "DATA") { data = []; socket.write("354 send message\r\n"); }
        else if (line === "QUIT") socket.end("221 bye\r\n");
        else socket.write("250 OK\r\n");
      }
    });
  });
  smtp.on("tlsClientError", () => {});
  await new Promise((resolve) => smtp.listen(0, "127.0.0.1", resolve));
  const smtpPort = smtp.address().port;
  const reservation = createTcpServer();
  await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const appPort = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const origin = `http://127.0.0.1:${appPort}`;
  app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(appPort)], {
    env: { ...process.env, NODE_EXTRA_CA_CERTS: certificate, EMAIL_ENCRYPTION_KEY: encryptionKey }, stdio: "ignore",
  });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(`${origin}/login`, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
    if (app.exitCode !== null) break;
    await delay(100);
  }
  assert.ok(ready, "Built app must start; run npm run build first");
  await db.query("INSERT INTO tenants (id, slug, name) VALUES ($1, $2, 'Email integration A'), ($3, $4, 'Email integration B')", [tenantIds[0], slug, tenantIds[1], `${slug}-b`]);
  async function token(tenantId, permissions, overrides = {}) {
    const secret = `cms_at_${randomBytes(32).toString("base64url")}`;
    await db.query("INSERT INTO access_tokens (tenant_id, name, token_hash, token_hint, permissions, expires_at, revoked_at) VALUES ($1, 'email integration', $2, 'test', $3, $4, $5)", [tenantId, createHash("sha256").update(secret).digest("hex"), permissions, overrides.expiresAt ?? null, overrides.revokedAt ?? null]);
    return secret;
  }
  const sendToken = await token(tenantIds[0], ["email:send"]);
  const readToken = await token(tenantIds[0], ["content:read"]);
  const otherToken = await token(tenantIds[1], ["email:send"]);
  const bothToken = await token(tenantIds[0], ["content:read", "email:send"]);
  const revokedToken = await token(tenantIds[0], ["email:send"], { revokedAt: new Date() });
  const expiredToken = await token(tenantIds[0], ["email:send"], { expiresAt: new Date(Date.now() - 1000) });
  const message = { to: "receiver@example.com", subject: "Integration email", text: "Plain body", html: "<p>HTML body</p>", replyTo: "visitor@example.org" };
  const send = (secret, body = message) => fetch(`${origin}/api/email/${slug}/send`, { method: "POST", headers: { "Content-Type": "application/json", ...(secret ? { Authorization: `Bearer ${secret}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  await t.test("unauthorized, revoked, expired, wrong-tenant and content-only tokens cannot send", async () => {
    for (const secret of [null, revokedToken, expiredToken]) assert.equal((await send(secret)).status, 401);
    for (const secret of [readToken, otherToken]) assert.equal((await send(secret)).status, 403);
    assert.equal((await send(sendToken)).status, 409);
    assert.equal(received.length, 0);
  });
  await db.query("INSERT INTO tenant_email_settings (tenant_id, enabled, host, port, encryption, username, encrypted_password, from_email, from_name, allowed_from, servername) VALUES ($1, true, '127.0.0.1', $2, 'tls', 'smtp-user', $3, 'website@example.com', 'Website', ARRAY['support@example.com'], 'localhost')", [tenantIds[0], smtpPort, encryptEmailPassword("smtp-password", tenantIds[0], encryptionKey)]);
  await t.test("the real TLS SMTP server receives both bodies, the default sender and reply-to", async () => {
    const response = await send(sendToken);
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    const result = await response.json();
    assert.equal(result.data.status, "accepted");
    assert.match(result.data.messageId, /^<.+>$/);
    assert.equal(received.length, 1);
    for (const pattern of [/From: Website <website@example.com>/, /Reply-To: visitor@example.org/, /multipart\/alternative/, /Plain body/, /<p>HTML body<\/p>/]) assert.match(received[0], pattern);
    assert.equal((await send(sendToken, { ...message, from: "Support <support@example.com>" })).status, 200);
    assert.match(received[1], /From: Support <support@example.com>/);
  });
  await t.test("validation, sender restrictions, disabled state and SMTP errors are enforced", async () => {
    assert.equal((await send(sendToken, { ...message, from: "attacker@example.org" })).status, 403);
    assert.equal((await send(sendToken, { ...message, text: { path: "/etc/passwd" } })).status, 422);
    assert.equal((await send(sendToken, { ...message, to: "reject@example.com" })).status, 502);
    await db.query("UPDATE tenant_email_settings SET enabled = false WHERE tenant_id = $1", [tenantIds[0]]);
    assert.equal((await send(sendToken)).status, 409);
    await db.query("UPDATE tenant_email_settings SET enabled = true WHERE tenant_id = $1", [tenantIds[0]]);
    assert.equal(received.length, 2);
  });
  await t.test("content access is preserved and email-only tokens cannot read content", async () => {
    const content = (secret) => fetch(`${origin}/api/content/${slug}/models`, { headers: { Authorization: `Bearer ${secret}` } });
    assert.equal((await content(readToken)).status, 200);
    assert.equal((await content(bothToken)).status, 200);
    assert.equal((await content(sendToken)).status, 403);
  });
  await t.test("concurrent attempts share an atomic tenant limit across tokens, then reset", async () => {
    await db.query("UPDATE tenant_email_rate_limits SET attempts = 29, window_started_at = now() WHERE tenant_id = $1", [tenantIds[0]]);
    const responses = await Promise.all(Array.from({ length: 8 }, (_, i) => send(i % 2 ? sendToken : bothToken)));
    assert.equal(responses.filter((response) => response.status === 200).length, 1);
    assert.equal(responses.filter((response) => response.status === 429).length, 7);
    assert.equal(responses.find((response) => response.status === 429).headers.get("retry-after"), "60");
    await db.query("UPDATE tenant_email_rate_limits SET window_started_at = now() - interval '61 seconds' WHERE tenant_id = $1", [tenantIds[0]]);
    assert.equal((await send(sendToken)).status, 200);
  });
});
