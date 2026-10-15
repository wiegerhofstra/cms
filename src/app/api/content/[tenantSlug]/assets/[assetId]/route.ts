import { handleContentApiRequest } from "@/lib/cms/content-api";
import { getDeliveryAsset } from "@/modules/content-delivery/service";

export async function GET(request: Request, context: RouteContext<"/api/content/[tenantSlug]/assets/[assetId]">) {
  const { tenantSlug, assetId } = await context.params;
  return handleContentApiRequest(request, tenantSlug, async (principal) => ({
    data: await getDeliveryAsset(principal.tenantId, assetId),
  }));
}
