import "server-only";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";

import { db } from "@/db";
import { tenantMemberships, tenants } from "@/db/schema";
import { auth } from "@/lib/auth/server";
import { getActiveTenantId } from "@/lib/tenant/active-tenant";

import { CmsError } from "./errors";
import type { TenantMembership, TenantRole } from "./types";

export type CmsRequestContext = {
  requestId: string;
  session: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
  user: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>["user"];
  activeTenantId: string | null;
  activeMembership: TenantMembership | null;
  memberships: TenantMembership[];
};

export async function getCmsContext(requestId: string, tenantSlug?: string): Promise<CmsRequestContext> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new CmsError("UNAUTHORIZED", "Authentication is required");
  }

  const memberships = await db
    .select({
      tenantId: tenantMemberships.tenantId,
      role: tenantMemberships.role,
      tenant: {
        id: tenants.id,
        slug: tenants.slug,
        name: tenants.name,
      },
    })
    .from(tenantMemberships)
    .innerJoin(tenants, eq(tenantMemberships.tenantId, tenants.id))
    .where(eq(tenantMemberships.userId, session.user.id));

  const cookieTenantId = tenantSlug ? null : await getActiveTenantId();
  const activeMembership = tenantSlug
    ? memberships.find((membership) => membership.tenant.slug === tenantSlug) ?? null
    : memberships.find((membership) => membership.tenantId === cookieTenantId) ?? null;

  return {
    requestId,
    session,
    user: session.user,
    activeTenantId: activeMembership?.tenantId ?? null,
    activeMembership,
    memberships,
  };
}

export async function requireTenantContext(
  requestId: string,
  tenantSlug?: string,
): Promise<CmsRequestContext & { activeMembership: TenantMembership; activeTenantId: string }> {
  const context = await getCmsContext(requestId, tenantSlug);

  if (!context.activeTenantId || !context.activeMembership) {
    throw new CmsError("FORBIDDEN", "Select a tenant before accessing this resource");
  }

  return {
    ...context,
    activeTenantId: context.activeTenantId,
    activeMembership: context.activeMembership,
  };
}

export function requireRole(context: CmsRequestContext, roles: TenantRole[]): void {
  if (!context.activeMembership || !roles.includes(context.activeMembership.role)) {
    throw new CmsError("FORBIDDEN", "You do not have access to this tenant");
  }
}

export function requireAdmin(context: CmsRequestContext): void {
  if (context.user.role !== "admin") {
    throw new CmsError("FORBIDDEN", "Administrator access is required");
  }
}
