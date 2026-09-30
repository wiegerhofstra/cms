import { CmsError } from "../../lib/cms/errors.ts";
import { emailMessageSchema, parseEmailInput, type EmailMessage } from "./validation.ts";
import type { EmailSendResult } from "./transport.ts";

export const MAX_EMAIL_REQUEST_BYTES = 512 * 1024;

async function readEmailBody(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new CmsError("BAD_REQUEST", "Content-Type must be application/json", 415);
  }
  if (Number(request.headers.get("content-length")) > MAX_EMAIL_REQUEST_BYTES) {
    throw new CmsError("PAYLOAD_TOO_LARGE", "Email requests cannot exceed 512 KiB");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new CmsError("BAD_REQUEST", "A JSON body is required");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_EMAIL_REQUEST_BYTES) {
        await reader.cancel();
        throw new CmsError("PAYLOAD_TOO_LARGE", "Email requests cannot exceed 512 KiB");
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof CmsError) throw error;
    throw new CmsError("BAD_REQUEST", "The request body must contain valid JSON");
  } finally { reader.releaseLock(); }
}

export async function handleEmailRequest(request: Request, tenantSlug: string, dependencies: {
  authenticate: (request: Request, tenantSlug: string, permission: "email:send") => Promise<{ tenantId: string }>;
  send: (tenantId: string, message: EmailMessage) => Promise<EmailSendResult>;
}): Promise<Response> {
  const requestId = crypto.randomUUID();
  const headers = new Headers({ "Cache-Control": "private, no-store", "X-Request-Id": requestId });
  try {
    const principal = await dependencies.authenticate(request, tenantSlug, "email:send");
    const message = parseEmailInput(emailMessageSchema, await readEmailBody(request));
    return Response.json({ data: await dependencies.send(principal.tenantId, message) }, { status: 200, headers });
  } catch (error) {
    const failure = error instanceof CmsError ? error : new CmsError("INTERNAL_SERVER_ERROR", "The email request could not be completed");
    if (failure.code === "UNAUTHORIZED") headers.set("WWW-Authenticate", "Bearer");
    if (failure.code === "TOO_MANY_REQUESTS") headers.set("Retry-After", "60");
    return Response.json({ error: { code: failure.code, message: failure.message, requestId } }, { status: failure.status, headers });
  }
}
