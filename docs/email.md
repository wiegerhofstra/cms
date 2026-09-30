# Tenant email

Administrators configure one SMTP connection per tenant at **Settings → Email** (`/app/settings/email`). Settings are independent of the tenant selected in the workbench navigation; the Email pane always identifies the tenant being edited.

## Setup

1. Install dependencies and apply migrations: `npm install && npm run db:migrate`.
2. Generate a key with `openssl rand -base64 32` and set `EMAIL_ENCRYPTION_KEY` on the server. Use the same key on every app instance. Restart the server after changing environment variables.
3. In Settings → Email, select the tenant and enter its SMTP host, port, encryption, username, password, and default sender. Default: port 587 with required STARTTLS. Port 465 normally uses TLS from connection start. Certificates are always validated; plaintext SMTP is not supported.
4. Save and use **Test connection** to check connectivity and authentication. Enable sending, save, and use **Send test email** to submit an actual message to the entered recipient.
5. In Settings → Auth, create or edit a token for that tenant and grant **Send email** (`email:send`). Tokens may have email access, content access, or both. Existing tokens retain only `content:read` after migration.

Passwords use AES-256-GCM authenticated encryption, bound to the tenant ID. The browser receives only a `hasPassword` flag, never the saved password or ciphertext. Leaving the password blank preserves it; entering a new value replaces it. Back up the encryption key separately from the database. Changing or losing the key makes existing passwords unreadable; save new SMTP passwords for each tenant after a key change.

The optional TLS server name is required when the SMTP host is an IP address. It must match the provider's certificate. Additional allowed senders are exact email addresses (up to 20); the default sender is always allowed. Configure addresses your SMTP provider has authorized. For contact forms, use the website's configured sender and put the visitor's address in `replyTo`.

## Send endpoint

```http
POST /api/email/{tenantSlug}/send
Authorization: Bearer cms_at_...
Content-Type: application/json
```

```json
{
  "from": "Website <website@example.com>",
  "to": "recipient@example.com",
  "replyTo": "visitor@example.org",
  "subject": "New enquiry",
  "text": "A visitor sent an enquiry.",
  "html": "<p>A visitor sent an enquiry.</p>"
}
```

| Field | Contract |
| --- | --- |
| `to` | Required. One plain email address. |
| `subject` | Required nonblank string, at most 200 characters. |
| `text` | Required nonblank string, at most 100,000 characters. |
| `html` | Optional nonempty string, at most 200,000 characters. Sent as the HTML alternative alongside `text`. |
| `from` | Optional single address, with optional display name. Must match the default or an additional allowed sender. Omit to use the configured sender and name. |
| `replyTo` | Optional single plain email address. |

This endpoint uses `to`, not `sendto`. Unknown fields are rejected. Attachments, multiple recipients, custom envelopes, file paths, and URL content sources are not supported. The whole JSON body is limited to 512 KiB, including streamed requests. Header fields reject control characters. Keep API tokens on a trusted server; a public contact form should call your application's backend, which validates the form and calls this endpoint.

Success (`200`):

```json
{
  "data": {
    "messageId": "<message-id@example.com>",
    "status": "accepted"
  }
}
```

Sending completes during the request. `accepted` means the SMTP server accepted the recipient and message; it does not confirm inbox delivery. There is no queue, automatic retry, delivery tracking, or idempotency guarantee. If the connection times out after SMTP acceptance, a retry can produce a duplicate. SMTP credentials and raw server error messages are not returned to callers.

Every application response includes `Cache-Control: private, no-store` and `X-Request-Id`. Errors use the existing CMS envelope:

```json
{
  "error": {
    "code": "EMAIL_NOT_CONFIGURED",
    "message": "Email sending is not enabled for this tenant",
    "requestId": "..."
  }
}
```

| Status | Meaning |
| --- | --- |
| `400` | Malformed JSON or missing body. |
| `401` | Missing, invalid, expired, or revoked bearer token. Includes `WWW-Authenticate: Bearer`. |
| `403` | Wrong tenant, missing `email:send` permission, or disallowed sender. |
| `409` | Email is disabled, unconfigured, or saved credentials cannot be decrypted. |
| `413` | JSON body exceeds 512 KiB. |
| `415` | Content type is not `application/json`. |
| `422` | Invalid fields or unsupported options. |
| `429` | Tenant email limit exceeded. Includes `Retry-After: 60`. |
| `502` | SMTP submission failed or recipient rejected. |
| `500` | Unexpected internal failure. |

The database enforces 30 SMTP attempts per tenant per one-minute window, shared by all tokens, connection tests, test messages, and app instances. Failed SMTP attempts count. Validation failures do not count. The window begins with the first attempt and resets after one minute; this is an attempt limit, not a delivery quota.

## Verification

`npm run test:email` covers encryption, validation, sender restrictions, transport safeguards, and the HTTP contract. `npm run test:email:integration` (after `npm run build` and database migration) starts a temporary production server and a local TLS SMTP receiver, uses temporary database fixtures, and removes them afterward. It does not send external email. Requires PostgreSQL access through `DATABASE_URL`, Node.js 22.18+ and OpenSSL.
