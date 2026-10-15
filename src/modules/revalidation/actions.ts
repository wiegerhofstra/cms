"use server";

import { revalidatePath } from "next/cache";
import { CmsError } from "@/lib/cms/errors";
import { revalidateTenant, saveRevalidationSettings } from "./service";

async function result<T>(action: () => Promise<T>) {
  try { return { ok: true as const, data: await action() }; }
  catch (error) {
    return { ok: false as const, error: error instanceof CmsError ? error.message : "The revalidation operation could not be completed" };
  }
}

export async function saveRevalidationSettingsAction(tenantId: string, input: unknown) {
  return result(async () => {
    const settings = await saveRevalidationSettings(tenantId, input);
    revalidatePath("/app", "layout");
    return settings;
  });
}

export async function revalidateTenantAction(tenantId: string) {
  return result(async () => {
    await revalidateTenant(tenantId);
    revalidatePath("/app", "layout");
  });
}
