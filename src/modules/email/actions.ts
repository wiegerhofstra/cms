"use server";

import { CmsError } from "@/lib/cms/errors";
import { saveEmailSettings, sendTenantTestEmail, verifyTenantEmail } from "./service";

async function result<T>(action: () => Promise<T>) {
  try { return { ok: true as const, data: await action() }; }
  catch (error) {
    return { ok: false as const, error: error instanceof CmsError ? error.message : "The email operation could not be completed" };
  }
}

export async function saveEmailSettingsAction(tenantId: string, input: unknown) {
  return result(() => saveEmailSettings(tenantId, input));
}

export async function verifyTenantEmailAction(tenantId: string) {
  return result(() => verifyTenantEmail(tenantId));
}

export async function sendTenantTestEmailAction(tenantId: string, recipient: string) {
  return result(() => sendTenantTestEmail(tenantId, recipient));
}
