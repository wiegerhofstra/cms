import { handleContentApiRequest } from "@/lib/cms/content-api";
import { getPublishedEntry, parseDeliveryQuery } from "@/modules/content-delivery/service";

export async function GET(request: Request, context: RouteContext<"/api/content/[tenantSlug]/models/[modelSlug]/entries/[entryId]">) {
  const { tenantSlug, modelSlug, entryId } = await context.params;
  return handleContentApiRequest(request, tenantSlug, async (principal) => {
    const query = parseDeliveryQuery(request.url, false);
    return {
      data: await getPublishedEntry({ tenantId: principal.tenantId, modelSlug, entryId, maxDepth: query.maxDepth }),
      meta: { maxDepth: query.maxDepth },
    };
  });
}
