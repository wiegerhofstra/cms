"use server";

import { revalidatePath } from "next/cache";
import { CmsError } from "@/lib/cms/errors";
import { saveLocalizationSettings } from "./service";

export async function saveLocalizationSettingsAction(tenantId: string, input: unknown) {
  try {
    const settings = await saveLocalizationSettings(tenantId, input);
    revalidatePath("/app", "layout");
    return { ok: true as const, data: settings };
  } catch (error) {
    return { ok: false as const, error: error instanceof CmsError ? error.message : "The language settings could not be saved" };
  }
}
