import { handleContentApiRequest } from "@/lib/cms/content-api";
import { getDeliveryModel } from "@/modules/content-delivery/service";

export async function GET(request: Request, context: RouteContext<"/api/content/[tenantSlug]/models/[modelSlug]">) {
  const { tenantSlug, modelSlug } = await context.params;
  return handleContentApiRequest(request, tenantSlug, async (principal) => ({
    data: await getDeliveryModel(principal.tenantId, modelSlug),
  }));
}
