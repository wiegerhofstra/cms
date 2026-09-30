import "server-only";

import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { tenantEmailRateLimits, tenantEmailSettings, tenants } from "@/db/schema";
import { getCmsContext, requireAdmin } from "@/lib/cms/context";
import { CmsError } from "@/lib/cms/errors";

import { decryptEmailPassword, emailCredentialsReady, encryptEmailPassword } from "./credentials";
import { createEmailTransport, deliverEmail } from "./transport";
import { emailAddressSchema, emailMessageSchema, emailSettingsSchema, parseEmailInput, resolveEmailMessage, type EmailMessage, type EmailSettingsSummary } from "./validation";

async function requireEmailAdmin(tenantId: string) {
  requireAdmin(await getCmsContext(crypto.randomUUID()));
  parseEmailInput(z.uuid(), tenantId);
  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw new CmsError("NOT_FOUND", "Tenant was not found");
}

function publicSettings(settings: typeof tenantEmailSettings.$inferSelect): EmailSettingsSummary {
  return {
    enabled: settings.enabled, host: settings.host, port: settings.port, encryption: settings.encryption,
    username: settings.username, fromEmail: settings.fromEmail, fromName: settings.fromName,
    allowedFrom: settings.allowedFrom, servername: settings.servername,
    hasPassword: Boolean(settings.encryptedPassword), updatedAt: settings.updatedAt.toISOString(),
  };
}

async function readSettings(tenantId: string) {
  const [settings] = await db.select().from(tenantEmailSettings).where(eq(tenantEmailSettings.tenantId, tenantId)).limit(1);
  return settings;
}

export async function getEmailSettingsForAdmin(tenantId: string): Promise<EmailSettingsSummary | null> {
  await requireEmailAdmin(tenantId);
  const settings = await readSettings(tenantId);
  return settings ? publicSettings(settings) : null;
}

export async function saveEmailSettings(tenantId: string, input: unknown) {
  await requireEmailAdmin(tenantId);
  const { password, ...settings } = parseEmailInput(emailSettingsSchema, input);
  if (!emailCredentialsReady()) throw new CmsError("INTERNAL_SERVER_ERROR", "Email credential storage is unavailable. Configure EMAIL_ENCRYPTION_KEY on the server.");
  const existing = await readSettings(tenantId);
  if (!password && !existing?.encryptedPassword) throw new CmsError("VALIDATION_ERROR", "An SMTP password is required for the first save");
  // Preserve the password in SQL when unchanged, including during concurrent saves.
  const encryptedPassword = password ? encryptEmailPassword(password, tenantId) : existing!.encryptedPassword;
  const [saved] = await db.insert(tenantEmailSettings).values({ tenantId, ...settings, encryptedPassword })
    .onConflictDoUpdate({ target: tenantEmailSettings.tenantId, set: {
      ...settings, ...(password ? { encryptedPassword } : {}), updatedAt: new Date(),
    } }).returning();
  return publicSettings(saved);
}

export async function consumeEmailRateLimit(tenantId: string) {
  const table = tenantEmailRateLimits;
  const expired = sql`${table.windowStartedAt} <= now() - interval '1 minute'`;
  const [allowed] = await db.insert(table).values({ tenantId })
    .onConflictDoUpdate({ target: table.tenantId, set: {
      attempts: sql`case when ${expired} then 1 else ${table.attempts} + 1 end`,
      windowStartedAt: sql`case when ${expired} then now() else ${table.windowStartedAt} end`,
    }, setWhere: sql`${expired} or ${table.attempts} < 30` })
    .returning({ tenantId: table.tenantId });
  if (!allowed) throw new CmsError("TOO_MANY_REQUESTS", "Email limit reached (30 attempts per minute per tenant). Try again in one minute.");
}

function transportFor(settings: typeof tenantEmailSettings.$inferSelect) {
  try {
    return createEmailTransport(settings, decryptEmailPassword(settings.encryptedPassword, settings.tenantId));
  } catch {
    throw new CmsError("EMAIL_NOT_CONFIGURED", "The saved SMTP password is unavailable. Check the server encryption key or save a new password.");
  }
}

export async function sendTenantEmail(tenantId: string, input: EmailMessage) {
  const settings = await readSettings(tenantId);
  if (!settings?.enabled) throw new CmsError("EMAIL_NOT_CONFIGURED", "Email sending is not enabled for this tenant");
  const message = resolveEmailMessage(settings, input);
  await consumeEmailRateLimit(tenantId);
  return deliverEmail(transportFor(settings), message);
}

export async function verifyTenantEmail(tenantId: string) {
  await requireEmailAdmin(tenantId);
  const settings = await readSettings(tenantId);
  if (!settings) throw new CmsError("EMAIL_NOT_CONFIGURED", "Save the email settings first");
  await consumeEmailRateLimit(tenantId);
  const transport = transportFor(settings);
  try {
    await transport.verify();
  } catch {
    throw new CmsError("EMAIL_SEND_FAILED", "SMTP connection failed. Check the host, port, encryption and credentials.");
  } finally { transport.close(); }
}

export async function sendTenantTestEmail(tenantId: string, recipient: unknown) {
  await requireEmailAdmin(tenantId);
  const to = parseEmailInput(emailAddressSchema, recipient);
  return sendTenantEmail(tenantId, parseEmailInput(emailMessageSchema, {
    to, subject: "CMS email configuration test",
    text: "Your tenant's SMTP configuration successfully submitted this test email.",
    html: "<p>Your tenant's SMTP configuration successfully submitted this test email.</p>",
  }));
}
