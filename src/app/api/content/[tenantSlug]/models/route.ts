import { handleContentApiRequest } from "@/lib/cms/content-api";
import { listDeliveryModels } from "@/modules/content-delivery/service";

export async function GET(request: Request, context: RouteContext<"/api/content/[tenantSlug]/models">) {
  const { tenantSlug } = await context.params;
  return handleContentApiRequest(request, tenantSlug, async (principal) => ({
    data: await listDeliveryModels(principal.tenantId),
  }));
}
