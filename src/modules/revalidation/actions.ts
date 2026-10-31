"use server";

import { revalidatePath } from "next/cache";
import { CmsError } from "@/lib/cms/errors";
import { revalidateTenant, saveConsumerType, saveRevalidationSettings } from "./service";

async function result<T>(action: () => Promise<T>) {
  try { return { ok: true as const, data: await action() }; }
  catch (error) {
    return { ok: false as const, error: error instanceof CmsError ? error.message : "The website update could not be completed" };
  }
}

export async function saveRevalidationSettingsAction(tenantId: string, input: unknown, consumerType: unknown) {
  return result(async () => {
    const settings = await saveRevalidationSettings(tenantId, input, consumerType);
    revalidatePath("/app", "layout");
    return settings;
  });
}

export async function revalidateTenantAction(tenantId: string, consumerType: unknown) {
  return result(async () => {
    await revalidateTenant(tenantId, consumerType);
    revalidatePath("/app", "layout");
  });
}

export async function saveConsumerTypeAction(tenantId: string, input: unknown) {
  return result(async () => {
    await saveConsumerType(tenantId, input);
    revalidatePath("/app", "layout");
  });
}
