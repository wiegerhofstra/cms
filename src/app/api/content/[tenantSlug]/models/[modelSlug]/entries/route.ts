import { handleContentApiRequest } from "@/lib/cms/content-api";
import { listPublishedEntries, parseDeliveryQuery } from "@/modules/content-delivery/service";

export async function GET(request: Request, context: RouteContext<"/api/content/[tenantSlug]/models/[modelSlug]/entries">) {
  const { tenantSlug, modelSlug } = await context.params;
  return handleContentApiRequest(request, tenantSlug, async (principal) => {
    const query = parseDeliveryQuery(request.url, true);
    const result = await listPublishedEntries({ tenantId: principal.tenantId, modelSlug, ...query });
    return {
      data: result.entries,
      meta: { nextCursor: result.nextCursor, maxDepth: query.maxDepth },
    };
  });
}
