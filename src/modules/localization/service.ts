import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { contentEntries, contentModelFields, tenants } from "@/db/schema";
import { getCmsContext, requireAdmin } from "@/lib/cms/context";
import { CmsError } from "@/lib/cms/errors";
import { isLocalizedField, rebaseEntryLocalization, type TenantLocalization } from "./locales";
import { getTenantLocalization } from "./tenant";
import { localizationSettingsSchema } from "./validation";

export async function getLocalizationSettingsForAdmin(tenantId: string): Promise<TenantLocalization> {
  await requireAdminTenant(tenantId);
  return getTenantLocalization(db, tenantId);
}

export async function saveLocalizationSettings(tenantId: string, input: unknown): Promise<TenantLocalization> {
  await requireAdminTenant(tenantId);
  const parsed = localizationSettingsSchema.safeParse(input);
  if (!parsed.success) throw new CmsError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Language settings are invalid");
  const next: TenantLocalization = parsed.data;

  return db.transaction(async (tx) => {
    // Lock the tenant so concurrent saves rebase entries from the settings they replace.
    const [previous] = await tx
      .select({ defaultLocale: tenants.defaultLocale, locales: tenants.locales })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .for("update");
    if (!previous) throw new CmsError("NOT_FOUND", "Tenant was not found");

    await tx.update(tenants).set({ ...next, updatedAt: new Date() }).where(eq(tenants.id, tenantId));

    const removedLocale = previous.locales.some((locale) => !next.locales.includes(locale));
    if (previous.defaultLocale === next.defaultLocale && !removedLocale) return next;

    const localizedFields = (await tx
      .select({ modelId: contentModelFields.modelId, key: contentModelFields.key, type: contentModelFields.type, localized: contentModelFields.localized })
      .from(contentModelFields)
      .where(and(eq(contentModelFields.tenantId, tenantId), eq(contentModelFields.localized, true))))
      .filter(isLocalizedField);
    if (!localizedFields.length) return next;

    const keysByModel = new Map<string, string[]>();
    for (const field of localizedFields) keysByModel.set(field.modelId, [...(keysByModel.get(field.modelId) ?? []), field.key]);

    const entries = await tx
      .select({ id: contentEntries.id, modelId: contentEntries.modelId, data: contentEntries.data, translations: contentEntries.translations })
      .from(contentEntries)
      .where(and(eq(contentEntries.tenantId, tenantId), inArray(contentEntries.modelId, [...keysByModel.keys()])));

    for (const entry of entries) {
      const rebased = rebaseEntryLocalization(keysByModel.get(entry.modelId) ?? [], entry, previous, next);
      if (JSON.stringify(rebased) === JSON.stringify({ data: entry.data, translations: entry.translations })) continue;
      // Moving values between locales changes no content, so this is not recorded as an entry revision.
      await tx.update(contentEntries).set(rebased).where(eq(contentEntries.id, entry.id));
    }

    return next;
  });
}

async function requireAdminTenant(tenantId: string) {
  const context = await getCmsContext(crypto.randomUUID());
  requireAdmin(context);
  if (!z.uuid().safeParse(tenantId).success) throw new CmsError("VALIDATION_ERROR", "Select a valid tenant");
}
