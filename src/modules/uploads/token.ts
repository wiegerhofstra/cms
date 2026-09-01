import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { getEnv } from "@/lib/env";

const uploadTokenSchema = z.object({
  assetId: z.uuid(),
  tenantId: z.uuid(),
  objectKey: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
});

export type UploadTokenPayload = z.infer<typeof uploadTokenSchema>;

export function createUploadToken(payload: UploadTokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function parseUploadToken(token: string): UploadTokenPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature || !verify(body, signature)) return null;

  try {
    const payload = uploadTokenSchema.parse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
    if (payload.expiresAt < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function sign(value: string): string {
  return createHmac("sha256", getEnv().BETTER_AUTH_SECRET).update(value).digest("base64url");
}

function verify(value: string, signature: string): boolean {
  const expected = sign(value);

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}
