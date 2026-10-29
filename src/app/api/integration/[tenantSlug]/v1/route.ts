import { cmsPublicUrl } from "@/lib/cms/public-url";
import { authenticateAccessToken } from "@/modules/access-tokens/authenticate";
import { handleDocumentationRequest } from "@/modules/integration-export/api";
import { exportTenantIntegration } from "@/modules/integration-export/service";

export async function GET(request: Request, context: RouteContext<"/api/integration/[tenantSlug]/v1">) {
  const { tenantSlug } = await context.params;
  return handleDocumentationRequest(request, tenantSlug, {
    authenticate: authenticateAccessToken,
    exportFiles: (slug) => exportTenantIntegration(slug, cmsPublicUrl),
  });
}
