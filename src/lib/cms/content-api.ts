import "server-only";

import { CmsError } from "./errors";
import { authenticateAccessToken, type AccessTokenPrincipal } from "@/modules/access-tokens/authenticate";

export async function handleContentApiRequest(
  request: Request,
  tenantSlug: string,
  handler: (principal: AccessTokenPrincipal) => Promise<unknown>,
): Promise<Response> {
  const requestId = request.headers.get("x-request-id")?.slice(0, 128) || crypto.randomUUID();

  try {
    const principal = await authenticateAccessToken(request, tenantSlug);
    return jsonResponse(await handler(principal), 200, requestId);
  } catch (error) {
    if (error instanceof CmsError) {
      return jsonResponse(
        { error: { code: error.code, message: error.message, requestId } },
        error.status,
        requestId,
        error.code === "UNAUTHORIZED" ? { "WWW-Authenticate": "Bearer" } : undefined,
      );
    }

    console.error("Content API request failed", { requestId, error });
    return jsonResponse(
      { error: { code: "INTERNAL_SERVER_ERROR", message: "The request could not be completed", requestId } },
      500,
      requestId,
    );
  }
}

function jsonResponse(body: unknown, status: number, requestId: string, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Request-Id", requestId);
  return Response.json(body, { status, headers });
}
