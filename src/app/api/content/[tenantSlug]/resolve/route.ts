import { handleContentApiRequest } from "@/lib/cms/content-api";
import { parseDeliveryQuery, resolvePublishedPage } from "@/modules/content-delivery/service";

export async function GET(request: Request, context: RouteContext<"/api/content/[tenantSlug]/resolve">) {
  const { tenantSlug } = await context.params;
  return handleContentApiRequest(request, tenantSlug, async (principal) => {
    const query = parseDeliveryQuery(request.url, false);
    const path = new URL(request.url).searchParams.get("path") ?? "";
    const result = await resolvePublishedPage({ tenantId: principal.tenantId, path, locale: query.locale, maxDepth: query.maxDepth });
    return { data: result.result, meta: { locale: result.locale, maxDepth: query.maxDepth } };
  });
}
