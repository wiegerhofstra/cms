import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { tenantRevalidationSettings, tenants } from "@/db/schema";
import { getCmsContext, requireAdmin } from "@/lib/cms/context";
import { CmsError } from "@/lib/cms/errors";
import { decryptRevalidationToken, encryptRevalidationToken } from "./credentials";
import type { ConsumerType } from "@/lib/cms/types";
import { requestCoolifyBuild } from "./coolify";
import { consumerTypeSchema, coolifyDeployUrl } from "./validation";
import { requestRevalidation } from "./request";
import { revalidationSettingsSchema, type RevalidationSettingsSummary } from "./validation";

async function requireAccess(tenantId: string, adminOnly = false) {
  const context = await getCmsContext(crypto.randomUUID());
  if (adminOnly) requireAdmin(context);
  if (!z.uuid().safeParse(tenantId).success) throw new CmsError("VALIDATION_ERROR", "Select a valid tenant");
  if (context.user.role !== "admin" && !context.memberships.some((membership) => membership.tenantId === tenantId)) {
    throw new CmsError("FORBIDDEN", "You do not have access to this tenant");
  }
  const [tenant] = await db.select({ id: tenants.id, consumerType: tenants.consumerType }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw new CmsError("NOT_FOUND", "Tenant was not found");
  return tenant;
}

function settingsFilter(tenantId: string, consumerType: ConsumerType) {
  return and(eq(tenantRevalidationSettings.tenantId, tenantId), eq(tenantRevalidationSettings.consumerType, consumerType));
}

async function readSettings(tenantId: string, consumerType: ConsumerType) {
  const [settings] = await db.select().from(tenantRevalidationSettings).where(settingsFilter(tenantId, consumerType)).limit(1);
  return settings;
}

function publicSettings(settings: typeof tenantRevalidationSettings.$inferSelect): RevalidationSettingsSummary {
  return { url: settings.url, hasToken: Boolean(settings.encryptedToken), updatedAt: settings.updatedAt.toISOString() };
}

export async function getRevalidationSettingsForAdmin(tenantId: string) {
  const { consumerType } = await requireAccess(tenantId, true);
  const settings = await readSettings(tenantId, consumerType);
  return settings ? publicSettings(settings) : null;
}

export async function getRevalidationStatus(tenantId: string) {
  const { consumerType } = await requireAccess(tenantId);
  const settings = await readSettings(tenantId, consumerType);
  return {
    consumerType,
    lastDeploymentId: settings?.lastDeploymentId ?? null,
    configured: Boolean(settings?.url && settings.encryptedToken),
    lastRevalidatedAt: settings?.lastRevalidatedAt?.toISOString() ?? null,
  };
}

export async function saveRevalidationSettings(tenantId: string, input: unknown, expectedConsumerType: unknown) {
  const { consumerType } = await requireAccess(tenantId, true);
  assertConsumerType(consumerType, expectedConsumerType);
  const parsed = revalidationSettingsSchema.safeParse(input);
  if (!parsed.success) throw new CmsError("VALIDATION_ERROR", parsed.error.issues[0].message);
  let { url } = parsed.data;
  const { token } = parsed.data;
  if (url && consumerType === "astro") {
    try { url = coolifyDeployUrl(url); }
    catch { throw new CmsError("VALIDATION_ERROR", "Use a Coolify deploy webhook with one application UUID and no other options except force."); }
  }
  if (!url) {
    await db.delete(tenantRevalidationSettings).where(settingsFilter(tenantId, consumerType));
    return null;
  }
  const existing = await readSettings(tenantId, consumerType);
  if (!token && !existing?.encryptedToken) throw new CmsError("VALIDATION_ERROR", "A token is required for the first save");
  const encryptedToken = token ? encryptRevalidationToken(token, tenantId) : existing!.encryptedToken;
  const [saved] = await db.insert(tenantRevalidationSettings).values({ tenantId, consumerType, url, encryptedToken })
    .onConflictDoUpdate({ target: [tenantRevalidationSettings.tenantId, tenantRevalidationSettings.consumerType], set: {
      url, ...(existing?.url !== url ? { lastRevalidatedAt: null, lastDeploymentId: null } : {}), ...(token ? { encryptedToken } : {}), updatedAt: new Date(),
    } }).returning();
  return publicSettings(saved);
}

export async function revalidateTenant(tenantId: string, expectedConsumerType: unknown) {
  const { consumerType } = await requireAccess(tenantId);
  assertConsumerType(consumerType, expectedConsumerType);
  const settings = await readSettings(tenantId, consumerType);
  if (!settings?.url || !settings.encryptedToken) throw new CmsError("BAD_REQUEST", "Website updates are not configured for this tenant");
  let token: string;
  try { token = decryptRevalidationToken(settings.encryptedToken, tenantId); }
  catch { throw new CmsError("BAD_REQUEST", "The saved token is unavailable. Save it again in Settings → Website."); }
  const lastDeploymentId = consumerType === "astro"
    ? await requestCoolifyBuild(settings.url, token)
    : (await requestRevalidation(settings.url, token), null);
  await db.update(tenantRevalidationSettings).set({ lastRevalidatedAt: new Date(), lastDeploymentId }).where(settingsFilter(tenantId, consumerType));
}

function assertConsumerType(actual: ConsumerType, expected: unknown) {
  if (actual !== consumerTypeSchema.parse(expected)) throw new CmsError("CONFLICT", "The consumer type changed. Refresh this page and try again.");
}

export async function saveConsumerType(tenantId: string, input: unknown) {
  await requireAccess(tenantId, true);
  const parsed = consumerTypeSchema.safeParse(input);
  if (!parsed.success) throw new CmsError("VALIDATION_ERROR", "Choose Next.js or Astro");
  await db.update(tenants).set({ consumerType: parsed.data, updatedAt: new Date() }).where(eq(tenants.id, tenantId));
}
