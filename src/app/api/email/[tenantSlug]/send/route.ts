import { authenticateAccessToken } from "@/modules/access-tokens/authenticate";
import { handleEmailRequest } from "@/modules/email/api";
import { sendTenantEmail } from "@/modules/email/service";

export async function POST(request: Request, context: RouteContext<"/api/email/[tenantSlug]/send">) {
  const { tenantSlug } = await context.params;
  return handleEmailRequest(request, tenantSlug, { authenticate: authenticateAccessToken, send: sendTenantEmail });
}
