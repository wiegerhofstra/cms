import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { accessTokens, tenants, user } from "@/db/schema";
import { getCmsContext, requireAdmin, type CmsRequestContext } from "@/lib/cms/context";
import { CmsError } from "@/lib/cms/errors";
import type { AccessTokenSummary } from "@/lib/cms/types";

import { generateAccessToken } from "./token";
import { accessTokenPermissionsSchema } from "./permissions";

const createAccessTokenSchema = z.object({
  name: z.string().trim().min(1).max(120),
  tenantId: z.uuid(),
  expiresInDays: z.number().int().min(1).max(3650).nullable().default(90),
  permissions: accessTokenPermissionsSchema.default(["content:read"]),
});

const updateAccessTokenSchema = z.object({
  name: z.string().trim().min(1).max(120),
  permissions: accessTokenPermissionsSchema.optional(),
});

export async function listAccessTokensForContext(context: CmsRequestContext): Promise<AccessTokenSummary[]> {
  requireAdmin(context);

  const rows = await db
    .select({
      id: accessTokens.id,
      name: accessTokens.name,
      tokenHint: accessTokens.tokenHint,
      permissions: accessTokens.permissions,
      tenantId: accessTokens.tenantId,
      tenantSlug: tenants.slug,
      tenantName: tenants.name,
      createdById: accessTokens.createdBy,
      createdByName: user.name,
      expiresAt: accessTokens.expiresAt,
      lastUsedAt: accessTokens.lastUsedAt,
      revokedAt: accessTokens.revokedAt,
      createdAt: accessTokens.createdAt,
      updatedAt: accessTokens.updatedAt,
    })
    .from(accessTokens)
    .innerJoin(tenants, eq(accessTokens.tenantId, tenants.id))
    .leftJoin(user, eq(accessTokens.createdBy, user.id))
    .orderBy(desc(accessTokens.createdAt));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    tokenHint: row.tokenHint,
    permissions: row.permissions,
    tenant: {
      id: row.tenantId,
      slug: row.tenantSlug,
      name: row.tenantName,
    },
    createdBy: row.createdById ? { id: row.createdById, name: row.createdByName ?? "Deleted user" } : null,
    expiresAt: nullableDateString(row.expiresAt),
    lastUsedAt: nullableDateString(row.lastUsedAt),
    revokedAt: nullableDateString(row.revokedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function createAccessToken(input: unknown) {
  const context = await getCmsContext(crypto.randomUUID());
  requireAdmin(context);
  const data = parseInput(createAccessTokenSchema, input);
  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, data.tenantId)).limit(1);
  if (!tenant) throw new CmsError("NOT_FOUND", "Tenant was not found");

  const generated = generateAccessToken();
  const expiresAt = data.expiresInDays === null ? null : new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000);
  const [created] = await db
    .insert(accessTokens)
    .values({
      tenantId: data.tenantId,
      name: data.name,
      tokenHash: generated.tokenHash,
      tokenHint: generated.tokenHint,
      permissions: data.permissions,
      createdBy: context.user.id,
      expiresAt,
    })
    .returning({ id: accessTokens.id });

  if (!created) throw new CmsError("INTERNAL_SERVER_ERROR", "Access token could not be created");
  return { id: created.id, token: generated.token };
}

export async function updateAccessToken(accessTokenId: string, input: unknown) {
  const context = await getCmsContext(crypto.randomUUID());
  requireAdmin(context);
  const data = parseInput(updateAccessTokenSchema, input);

  const [updated] = await db
    .update(accessTokens)
    .set({ name: data.name, ...(data.permissions ? { permissions: data.permissions } : {}), updatedAt: new Date() })
    .where(eq(accessTokens.id, parseUuid(accessTokenId)))
    .returning({ id: accessTokens.id });
  if (!updated) throw new CmsError("NOT_FOUND", "Access token was not found");

  return { accessTokenId: updated.id };
}

export async function revokeAccessToken(accessTokenId: string) {
  const context = await getCmsContext(crypto.randomUUID());
  requireAdmin(context);
  const now = new Date();

  const [revoked] = await db
    .update(accessTokens)
    .set({ revokedAt: now, updatedAt: now })
    .where(and(eq(accessTokens.id, parseUuid(accessTokenId)), isNull(accessTokens.revokedAt)))
    .returning({ id: accessTokens.id });
  if (!revoked) throw new CmsError("NOT_FOUND", "Active access token was not found");

  return { accessTokenId: revoked.id };
}

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new CmsError("VALIDATION_ERROR", result.error.issues[0]?.message ?? "Input is invalid");
  return result.data;
}

function nullableDateString(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function parseUuid(value: string): string {
  const result = z.uuid().safeParse(value);
  if (!result.success) throw new CmsError("VALIDATION_ERROR", "Access token id is invalid");
  return result.data;
}
