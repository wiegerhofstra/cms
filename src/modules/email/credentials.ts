import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

function encryptionKey(secret: string | undefined): Buffer {
  if (!secret || secret.length < 32) {
    throw new Error("Email credential storage is unavailable");
  }
  return Buffer.from(hkdfSync("sha256", secret, "cms:email", "password-encryption:v1", 32));
}

export function emailCredentialsReady(secret = process.env.BETTER_AUTH_SECRET): boolean {
  try { encryptionKey(secret); return true; } catch { return false; }
}

export function encryptEmailPassword(password: string, tenantId: string, secret = process.env.BETTER_AUTH_SECRET): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  cipher.setAAD(Buffer.from(`cms:email:${tenantId}`));
  const encrypted = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptEmailPassword(value: string, tenantId: string, secret = process.env.BETTER_AUTH_SECRET): string {
  const [version, iv, tag, encrypted, extra] = value.split(":");
  if (version !== "v1" || !iv || !tag || !encrypted || extra !== undefined) throw new Error("Invalid email credential");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), Buffer.from(iv, "base64"));
  decipher.setAAD(Buffer.from(`cms:email:${tenantId}`));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8");
}
