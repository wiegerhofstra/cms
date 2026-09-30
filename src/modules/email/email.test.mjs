import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";

import { CmsError } from "../../lib/cms/errors.ts";
import { handleEmailRequest, MAX_EMAIL_REQUEST_BYTES } from "./api.ts";
import { decryptEmailPassword, emailCredentialsReady, encryptEmailPassword } from "./credentials.ts";
import { deliverEmail, smtpOptions } from "./transport.ts";
import { emailMessageSchema, emailSettingsSchema, parseEmailInput, resolveEmailMessage } from "./validation.ts";

const settings = {
  enabled: true, host: "smtp.example.com", port: 587, encryption: "starttls", username: "smtp-user",
  password: "smtp-secret", fromEmail: "website@example.com", fromName: "Website", allowedFrom: ["support@example.com"], servername: "",
};
const message = { to: "recipient@example.com", subject: "Hello", text: "Plain text", html: "<p>HTML</p>" };

test("SMTP passwords are randomized, authenticated and bound to a tenant and key", () => {
  const key = randomBytes(32).toString("base64");
  const ciphertext = encryptEmailPassword(" password with spaces ", "tenant-a", key);
  assert.equal(decryptEmailPassword(ciphertext, "tenant-a", key), " password with spaces ");
  assert.notEqual(encryptEmailPassword(" password with spaces ", "tenant-a", key), ciphertext);
  assert.ok(!ciphertext.includes("password"));
  assert.throws(() => decryptEmailPassword(ciphertext, "tenant-b", key));
  assert.throws(() => decryptEmailPassword(ciphertext, "tenant-a", randomBytes(32).toString("base64")));
  const parts = ciphertext.split(":");
  const tampered = Buffer.from(parts[3], "base64");
  tampered[0] ^= 1;
  parts[3] = tampered.toString("base64");
  assert.throws(() => decryptEmailPassword(parts.join(":"), "tenant-a", key));
  assert.equal(emailCredentialsReady("bad-key"), false);
  assert.equal(emailCredentialsReady(key), true);
});

test("SMTP settings require valid addresses, ports and a TLS name for IP hosts", () => {
  assert.equal(emailSettingsSchema.safeParse(settings).success, true);
  for (const override of [{ host: "smtp://example.com" }, { port: 0 }, { port: 65536 }, { encryption: "none" }, { fromEmail: "invalid" }, { host: "127.0.0.1" }, { fromName: "Name\r\nBcc: bad@example.com" }]) {
    assert.equal(emailSettingsSchema.safeParse({ ...settings, ...override }).success, false, JSON.stringify(override));
  }
  assert.equal(emailSettingsSchema.safeParse({ ...settings, host: "127.0.0.1", servername: "localhost" }).success, true);
});

test("the default sender and explicitly allowed overrides are enforced", () => {
  assert.deepEqual(resolveEmailMessage(settings, parseEmailInput(emailMessageSchema, message)).from, { name: "Website", address: "website@example.com" });
  assert.deepEqual(resolveEmailMessage(settings, parseEmailInput(emailMessageSchema, { ...message, from: '"Support team" <support@example.com>' })).from, { name: "Support team", address: "support@example.com" });
  assert.throws(() => resolveEmailMessage(settings, parseEmailInput(emailMessageSchema, { ...message, from: '"website@example.com" <attacker@example.org>' })), { code: "FORBIDDEN" });
});

test("messages reject header injection, multiple senders, unknown options and non-string bodies", () => {
  for (const override of [
    { subject: "Hello\r\nBcc: bad@example.com" }, { subject: "\nHello" },
    { from: "one@example.com,two@example.com" }, { from: "Group:one@example.com;" },
    { from: "not-an-email" }, { replyTo: "invalid" }, { to: ["recipient@example.com"] },
    { text: { path: "/etc/passwd" } }, { html: { path: "http://localhost/secret" } },
    { text: " " }, { text: "x".repeat(100001) }, { html: "x".repeat(200001) },
    { attachments: [] }, { envelope: { to: "bad@example.com" } }, { disableFileAccess: false },
  ]) assert.equal(emailMessageSchema.safeParse({ ...message, ...override }).success, false, JSON.stringify(override).slice(0, 100));
  assert.equal(emailMessageSchema.safeParse({ to: message.to, subject: "Subject", text: "Text" }).success, true);
});

test("SMTP options enforce TLS, certificate validation, timeouts and no content file/URL access", () => {
  const starttls = smtpOptions(settings, "secret");
  assert.equal(starttls.secure, false);
  assert.equal(starttls.requireTLS, true);
  assert.equal(starttls.tls.rejectUnauthorized, true);
  assert.equal(starttls.disableFileAccess, true);
  assert.equal(starttls.disableUrlAccess, true);
  const tls = smtpOptions({ ...settings, encryption: "tls", port: 465, servername: "mail.example.com" }, "secret");
  assert.equal(tls.secure, true);
  assert.equal(tls.tls.servername, "mail.example.com");
});

test("delivery reports SMTP acceptance and hides transport error details", async () => {
  const resolved = resolveEmailMessage(settings, parseEmailInput(emailMessageSchema, message));
  let closed = 0;
  const transport = { close: () => closed++, sendMail: async () => ({ messageId: "<test@example.com>", accepted: [message.to], rejected: [] }) };
  assert.deepEqual(await deliverEmail(transport, resolved), { messageId: "<test@example.com>", status: "accepted" });
  await assert.rejects(deliverEmail({ ...transport, sendMail: async () => { throw new Error("password=secret body=private"); } }, resolved), (error) => error.code === "EMAIL_SEND_FAILED" && !error.message.includes("secret"));
  await assert.rejects(deliverEmail({ ...transport, sendMail: async () => ({ messageId: "id", accepted: [], rejected: [message.to] }) }, resolved), { code: "EMAIL_SEND_FAILED" });
  assert.equal(closed, 3);
});

function request(body = message, headers = {}) {
  return new Request("http://localhost/api/email/acme/send", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
}
const dependencies = {
  authenticate: async (_request, slug, permission) => { assert.equal(slug, "acme"); assert.equal(permission, "email:send"); return { tenantId: "tenant-a" }; },
  send: async (tenantId, body) => { assert.equal(tenantId, "tenant-a"); assert.equal(body.to, message.to); return { messageId: "<message@example.com>", status: "accepted" }; },
};

test("the API requests email permission and uses the authenticated tenant", async () => {
  const response = await handleEmailRequest(request(), "acme", dependencies);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.status, "accepted");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.ok(response.headers.get("x-request-id"));
});

test("authentication precedes body parsing or sending", async () => {
  const response = await handleEmailRequest(request({ text: {} }), "acme", {
    authenticate: async () => { throw new CmsError("UNAUTHORIZED", "A bearer token is required"); },
    send: async () => assert.fail("Must not send"),
  });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("www-authenticate"), "Bearer");
});

test("API validation rejects malformed JSON, wrong content types and oversized streams", async () => {
  const noSend = { ...dependencies, send: async () => assert.fail("Must not send") };
  assert.equal((await handleEmailRequest(request({ ...message, text: {} }), "acme", noSend)).status, 422);
  assert.equal((await handleEmailRequest(request(message, { "Content-Type": "text/plain" }), "acme", noSend)).status, 415);
  const badJson = new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
  assert.equal((await handleEmailRequest(badJson, "acme", noSend)).status, 400);
  assert.equal((await handleEmailRequest(request(message, { "Content-Length": String(MAX_EMAIL_REQUEST_BYTES + 1) }), "acme", noSend)).status, 413);
  const streamed = new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MAX_EMAIL_REQUEST_BYTES + 1)); controller.close(); } }), duplex: "half" });
  assert.equal((await handleEmailRequest(streamed, "acme", noSend)).status, 413);
});

test("API errors carry a request id, rate-limit retry hint and no unexpected error details", async () => {
  for (const [error, status] of [[new CmsError("TOO_MANY_REQUESTS", "Rate limited"), 429], [new CmsError("EMAIL_NOT_CONFIGURED", "Disabled"), 409], [new Error("private database details"), 500]]) {
    const response = await handleEmailRequest(request(), "acme", { ...dependencies, send: async () => { throw error; } });
    assert.equal(response.status, status);
    if (status === 429) assert.equal(response.headers.get("retry-after"), "60");
    const body = await response.json();
    assert.equal(body.error.requestId, response.headers.get("x-request-id"));
    assert.ok(!body.error.message.includes("private"));
  }
});
