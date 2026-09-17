import { getCmsContext, requireAdmin } from "@/lib/cms/context";
import { CmsError } from "@/lib/cms/errors";
import { createIntegrationArchive } from "@/modules/integration-export/archive";
import { exportTenantIntegration } from "@/modules/integration-export/service";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const headers = new Headers({ "Cache-Control": "private, no-store", "X-Request-Id": requestId });
  try {
    // Route handlers do not inherit the settings layout's authorization.
    requireAdmin(await getCmsContext(requestId));
    const url = new URL(request.url);
    const tenantSlug = url.searchParams.get("tenantSlug");
    if (!tenantSlug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tenantSlug) || tenantSlug.length > 80) {
      throw new CmsError("BAD_REQUEST", "A valid tenantSlug is required");
    }
    const format = url.searchParams.get("format") ?? "bundle";
    if (format !== "bundle" && format !== "guide") throw new CmsError("BAD_REQUEST", "format must be bundle or guide");
    const files = await exportTenantIntegration(tenantSlug, url.origin);
    if (format === "guide") {
      headers.set("Content-Type", "text/markdown; charset=utf-8");
      return new Response(files["INTEGRATION.md"], { headers });
    }
    headers.set("Content-Type", "application/gzip");
    headers.set("Content-Disposition", `attachment; filename="cms-${tenantSlug}-integration.tar.gz"`);
    return new Response(createIntegrationArchive(files), { headers });
  } catch (error) {
    const known = error instanceof CmsError;
    if (!known) console.error("Integration export failed", { requestId, error });
    return Response.json({ error: {
      code: known ? error.code : "INTERNAL_SERVER_ERROR",
      message: known ? error.message : "The integration export could not be created",
      requestId,
    } }, { status: known ? error.status : 500, headers });
  }
}
