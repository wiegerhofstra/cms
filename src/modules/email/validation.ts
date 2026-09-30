import addressparser from "nodemailer/lib/addressparser/index.js";
import { isIP } from "node:net";
import { z } from "zod";

import { CmsError } from "../../lib/cms/errors.ts";

const noControls = (value: string) => !/[\x00-\x1f\x7f]/.test(value);
const header = z.string().refine(noControls, "Headers cannot contain control characters").trim().max(320);
export const emailAddressSchema = header.pipe(z.email().max(254));
const hostname = z.string().trim().min(1).max(253).refine(
  (value) => isIP(value) !== 0 || value.split(".").every((label) => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label)),
  "Enter a hostname or IP address, without a protocol or port",
);

const senderSchema = header.min(1).transform((value, context) => {
  const addresses = addressparser(value);
  const address = addresses[0];
  const parsedEmail = emailAddressSchema.safeParse(address && "address" in address ? address.address : undefined);
  if (addresses.length !== 1 || !address || "group" in address || !parsedEmail.success) {
    context.addIssue({ code: "custom", message: "from must contain one valid email address, optionally with a display name" });
    return z.NEVER;
  }
  return { address: parsedEmail.data, name: address.name };
});

export const emailSettingsSchema = z.strictObject({
  enabled: z.boolean(),
  host: hostname,
  port: z.number().int().min(1).max(65535),
  encryption: z.enum(["starttls", "tls"]),
  username: z.string().trim().min(1).max(320).refine(noControls),
  password: z.string().max(4096).default(""),
  fromEmail: emailAddressSchema,
  fromName: header.max(120).default(""),
  allowedFrom: z.array(emailAddressSchema).max(20).default([]),
  servername: z.union([z.literal(""), hostname]).default(""),
}).refine((settings) => !isIP(settings.host) || (settings.servername !== "" && !isIP(settings.servername)), {
  path: ["servername"], message: "Set a TLS server name when connecting to an IP address",
});

export type EmailSettingsInput = z.input<typeof emailSettingsSchema>;
export type EmailSettings = Omit<z.output<typeof emailSettingsSchema>, "password">;
export type EmailSettingsSummary = EmailSettings & { hasPassword: boolean; updatedAt: string };

export const emailMessageSchema = z.strictObject({
  from: senderSchema.optional(),
  to: emailAddressSchema,
  replyTo: emailAddressSchema.optional(),
  subject: header.min(1).max(200),
  text: z.string().min(1).max(100_000).refine((value) => value.trim().length > 0, "text cannot be blank"),
  html: z.string().min(1).max(200_000).optional(),
});

export type EmailMessage = z.output<typeof emailMessageSchema>;

export function parseEmailInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new CmsError("VALIDATION_ERROR", `${issue.path.join(".") || "Request"}: ${issue.message}`);
  }
  return result.data;
}

export function resolveEmailMessage(settings: EmailSettings, input: EmailMessage) {
  const from = input.from ?? { address: settings.fromEmail, name: settings.fromName };
  const allowed = [settings.fromEmail, ...settings.allowedFrom].map((address) => address.toLowerCase());
  if (!allowed.includes(from.address.toLowerCase())) {
    throw new CmsError("FORBIDDEN", "The sender is not allowed for this tenant");
  }
  return { ...input, from };
}
