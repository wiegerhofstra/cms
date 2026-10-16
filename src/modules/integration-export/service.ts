import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { contentModelFields, contentModelFieldTargets, contentModels, tenantRevalidationSettings, tenants } from "@/db/schema";
import { CmsError } from "@/lib/cms/errors";

import { generateIntegrationFiles } from "./generate";

export async function exportTenantIntegration(tenantSlug: string, origin: string) {
  // One snapshot, including ALL models (the delivery model-list endpoint is capped at 100).
  return db.transaction(async (tx) => {
    const [tenant] = await tx.select({ id: tenants.id, name: tenants.name, slug: tenants.slug, defaultLocale: tenants.defaultLocale, locales: tenants.locales })
      .from(tenants).where(eq(tenants.slug, tenantSlug)).limit(1);
    if (!tenant) throw new CmsError("NOT_FOUND", "Tenant was not found");
    const [revalidation] = await tx.select({ url: tenantRevalidationSettings.url })
      .from(tenantRevalidationSettings).where(eq(tenantRevalidationSettings.tenantId, tenant.id)).limit(1);

    const models = await tx.select({
      id: contentModels.id, name: contentModels.name, slug: contentModels.slug, pageUrl: contentModels.pageUrl, status: contentModels.status,
    }).from(contentModels).where(eq(contentModels.tenantId, tenant.id)).orderBy(contentModels.slug);
    const fields = await tx.select().from(contentModelFields)
      .where(eq(contentModelFields.tenantId, tenant.id)).orderBy(contentModelFields.position, contentModelFields.key);
    const targets = await tx.select({ fieldId: contentModelFieldTargets.fieldId, modelId: contentModels.id })
      .from(contentModelFieldTargets)
      .innerJoin(contentModelFields, eq(contentModelFields.id, contentModelFieldTargets.fieldId))
      .innerJoin(contentModels, eq(contentModels.id, contentModelFieldTargets.targetModelId))
      .where(and(eq(contentModelFields.tenantId, tenant.id), eq(contentModels.tenantId, tenant.id)));

    return generateIntegrationFiles({
      tenant: { name: tenant.name, slug: tenant.slug, defaultLocale: tenant.defaultLocale, locales: tenant.locales },
      origin,
      revalidation: { configured: Boolean(revalidation), url: revalidation?.url ?? null },
      models: models.map((model) => ({
        ...model,
        fields: fields.filter((field) => field.modelId === model.id).map((field) => ({
          key: field.key, label: field.label, type: field.type, required: field.required,
          isList: field.isList, isTitle: field.isTitle, localized: field.localized, config: field.config,
          targetModelIds: targets.filter((target) => target.fieldId === field.id).map((target) => target.modelId).sort(),
        })),
      })),
    });
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
