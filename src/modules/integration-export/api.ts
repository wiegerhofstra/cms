import { CmsError } from "../../lib/cms/errors.ts";
import { createDocumentationSnapshot } from "./snapshot.ts";

export async function handleDocumentationRequest(request: Request, tenantSlug: string, dependencies: {
  authenticate: (request: Request, tenantSlug: string, permission: "docs:read") => Promise<{ tenantSlug: string }>;
  exportFiles: (tenantSlug: string) => Promise<Record<string, string>>;
}): Promise<Response> {
  const requestId = crypto.randomUUID();
  const headers = new Headers({ "Cache-Control": "private, no-store", "X-Request-Id": requestId });
  try {
    const principal = await dependencies.authenticate(request, tenantSlug, "docs:read");
    const files = await dependencies.exportFiles(principal.tenantSlug);
    return Response.json(createDocumentationSnapshot(principal.tenantSlug, files), { headers });
  } catch (error) {
    const failure = error instanceof CmsError ? error : new CmsError("INTERNAL_SERVER_ERROR", "The documentation export could not be created");
    if (!(error instanceof CmsError)) console.error("Documentation export failed", { requestId, error });
    if (failure.code === "UNAUTHORIZED") headers.set("WWW-Authenticate", "Bearer");
    return Response.json({ error: { code: failure.code, message: failure.message, requestId } }, { status: failure.status, headers });
  }
}
