import { and, eq } from "drizzle-orm";

import type { Db } from "@/db";
import { contentModelFields, contentModels } from "@/db/schema";
import { CmsError } from "@/lib/cms/errors";
import { lockPagePaths } from "@/modules/entries/links";

export async function deleteModelField(db: Db, tenantId: string, modelId: string, fieldId: string) {
  await db.transaction(async (tx) => {
    await lockPagePaths(tx, tenantId);
    const [model] = await tx.select({ status: contentModels.status, pageUrl: contentModels.pageUrl })
      .from(contentModels)
      .where(and(eq(contentModels.tenantId, tenantId), eq(contentModels.id, modelId)))
      .for("update");
    if (!model) throw new CmsError("NOT_FOUND", "Model was not found");
    if (model.status === "archived") throw new CmsError("CONFLICT", "Archived models cannot be edited");

    const scope = and(eq(contentModelFields.tenantId, tenantId), eq(contentModelFields.modelId, modelId), eq(contentModelFields.id, fieldId));
    const [field] = await tx.select({ key: contentModelFields.key }).from(contentModelFields).where(scope).for("update");
    if (!field) throw new CmsError("NOT_FOUND", "Field was not found");
    if (model.pageUrl?.pattern.includes("{slug}") && model.pageUrl.slugField === field.key) {
      throw new CmsError("CONFLICT", "This field is used for page URLs. Change the model's page URL settings first.");
    }

    // Removing the definition hides the field in the editor. Keep stored values,
    // translations, revisions, and component entries rather than deleting content.
    await tx.delete(contentModelFields).where(scope);
  });
  return { deleted: true as const };
}
