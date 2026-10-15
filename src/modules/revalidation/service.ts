import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { tenantRevalidationSettings, tenants } from "@/db/schema";
import { getCmsContext, requireAdmin } from "@/lib/cms/context";
import { CmsError } from "@/lib/cms/errors";
import { decryptRevalidationToken, encryptRevalidationToken } from "./credentials";
import { requestRevalidation } from "./request";
import { revalidationSettingsSchema, type RevalidationSettingsSummary } from "./validation";

async function requireAccess(tenantId: string, adminOnly = false) {
  const context = await getCmsContext(crypto.randomUUID());
  if (adminOnly) requireAdmin(context);
  if (!z.uuid().safeParse(tenantId).success) throw new CmsError("VALIDATION_ERROR", "Select a valid tenant");
  if (context.user.role !== "admin" && !context.memberships.some((membership) => membership.tenantId === tenantId)) {
    throw new CmsError("FORBIDDEN", "You do not have access to this tenant");
  }
  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw new CmsError("NOT_FOUND", "Tenant was not found");
}

async function readSettings(tenantId: string) {
  const [settings] = await db.select().from(tenantRevalidationSettings).where(eq(tenantRevalidationSettings.tenantId, tenantId)).limit(1);
  return settings;
}

function publicSettings(settings: typeof tenantRevalidationSettings.$inferSelect): RevalidationSettingsSummary {
  return { url: settings.url, hasToken: Boolean(settings.encryptedToken), updatedAt: settings.updatedAt.toISOString() };
}

export async function getRevalidationSettingsForAdmin(tenantId: string) {
  await requireAccess(tenantId, true);
  const settings = await readSettings(tenantId);
  return settings ? publicSettings(settings) : null;
}

export async function getRevalidationStatus(tenantId: string) {
  await requireAccess(tenantId);
  const settings = await readSettings(tenantId);
  return {
    configured: Boolean(settings?.url && settings.encryptedToken),
    lastRevalidatedAt: settings?.lastRevalidatedAt?.toISOString() ?? null,
  };
}

export async function saveRevalidationSettings(tenantId: string, input: unknown) {
  await requireAccess(tenantId, true);
  const parsed = revalidationSettingsSchema.safeParse(input);
  if (!parsed.success) throw new CmsError("VALIDATION_ERROR", parsed.error.issues[0].message);
  const { url, token } = parsed.data;
  if (!url) {
    await db.delete(tenantRevalidationSettings).where(eq(tenantRevalidationSettings.tenantId, tenantId));
    return null;
  }
  const existing = await readSettings(tenantId);
  if (!token && !existing?.encryptedToken) throw new CmsError("VALIDATION_ERROR", "A revalidation token is required for the first save");
  const encryptedToken = token ? encryptRevalidationToken(token, tenantId) : existing!.encryptedToken;
  const [saved] = await db.insert(tenantRevalidationSettings).values({ tenantId, url, encryptedToken })
    .onConflictDoUpdate({ target: tenantRevalidationSettings.tenantId, set: {
      url, ...(token ? { encryptedToken } : {}), updatedAt: new Date(),
    } }).returning();
  return publicSettings(saved);
}

export async function revalidateTenant(tenantId: string) {
  await requireAccess(tenantId);
  const settings = await readSettings(tenantId);
  if (!settings?.url || !settings.encryptedToken) throw new CmsError("BAD_REQUEST", "Revalidation is not configured for this tenant");
  let token: string;
  try { token = decryptRevalidationToken(settings.encryptedToken, tenantId); }
  catch { throw new CmsError("BAD_REQUEST", "The saved revalidation token is unavailable. Save the token again in Settings → Revalidation."); }
  await requestRevalidation(settings.url, token);
  await db.update(tenantRevalidationSettings).set({ lastRevalidatedAt: new Date() }).where(eq(tenantRevalidationSettings.tenantId, tenantId));
}
