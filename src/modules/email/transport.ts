import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";

import { CmsError } from "../../lib/cms/errors.ts";
import type { EmailMessage, EmailSettings } from "./validation.ts";

export function smtpOptions(settings: EmailSettings, password: string): SMTPTransport.Options {
  return {
    host: settings.host,
    port: settings.port,
    secure: settings.encryption === "tls",
    requireTLS: settings.encryption === "starttls",
    auth: { user: settings.username, pass: password },
    tls: { rejectUnauthorized: true, ...(settings.servername ? { servername: settings.servername } : {}) },
    disableFileAccess: true,
    disableUrlAccess: true,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    dnsTimeout: 10_000,
    logger: false,
    debug: false,
  };
}

export function createEmailTransport(settings: EmailSettings, password: string) {
  return nodemailer.createTransport(smtpOptions(settings, password));
}

export type EmailSendResult = { messageId: string; status: "accepted" };

export async function deliverEmail(
  transport: Pick<ReturnType<typeof createEmailTransport>, "sendMail" | "close">,
  message: EmailMessage & { from: { address: string; name: string } },
): Promise<EmailSendResult> {
  try {
    const info = await transport.sendMail(message);
    if (!info.accepted.length || info.rejected.length) throw new Error("Recipient rejected");
    return { messageId: info.messageId, status: "accepted" };
  } catch {
    // SMTP errors can contain credentials, server responses or message contents.
    throw new CmsError("EMAIL_SEND_FAILED", "The SMTP server could not accept the email. Check the email settings and recipient.");
  } finally {
    transport.close();
  }
}
