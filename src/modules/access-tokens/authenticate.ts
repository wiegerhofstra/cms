import "server-only";

import { and, eq, isNull, lt, or } from "drizzle-orm";

import { db } from "@/db";
import { accessTokens, tenants } from "@/db/schema";
import { CmsError } from "@/lib/cms/errors";

import { hashAccessToken } from "./token";

export type AccessTokenPrincipal = {
  accessTokenId: string;
  tenantId: string;
  tenantSlug: string;
};

export async function authenticateAccessToken(request: Request, tenantSlug: string): Promise<AccessTokenPrincipal> {
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) throw new CmsError("UNAUTHORIZED", "A valid bearer token is required");

  const [record] = await db
    .select({
      id: accessTokens.id,
      tenantId: accessTokens.tenantId,
      tenantSlug: tenants.slug,
      expiresAt: accessTokens.expiresAt,
      revokedAt: accessTokens.revokedAt,
      lastUsedAt: accessTokens.lastUsedAt,
    })
    .from(accessTokens)
    .innerJoin(tenants, eq(accessTokens.tenantId, tenants.id))
    .where(eq(accessTokens.tokenHash, hashAccessToken(token)))
    .limit(1);

  if (!record || record.revokedAt || (record.expiresAt && record.expiresAt.getTime() <= Date.now())) {
    throw new CmsError("UNAUTHORIZED", "A valid bearer token is required");
  }
  if (record.tenantSlug !== tenantSlug) throw new CmsError("FORBIDDEN", "This token cannot access the requested tenant");

  const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
  if (!record.lastUsedAt || record.lastUsedAt < staleBefore) {
    await db
      .update(accessTokens)
      .set({ lastUsedAt: new Date() })
      .where(and(eq(accessTokens.id, record.id), or(isNull(accessTokens.lastUsedAt), lt(accessTokens.lastUsedAt, staleBefore))));
  }

  return {
    accessTokenId: record.id,
    tenantId: record.tenantId,
    tenantSlug: record.tenantSlug,
  };
}

function bearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  return match?.[1]?.startsWith("cms_at_") ? match[1] : null;
}
