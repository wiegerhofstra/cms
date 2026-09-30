import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function encryptionKey(value: string | undefined): Buffer {
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    throw new Error("EMAIL_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
  return Buffer.from(value, "base64");
}

export function emailCredentialsReady(key = process.env.EMAIL_ENCRYPTION_KEY): boolean {
  try { encryptionKey(key); return true; } catch { return false; }
}

export function encryptEmailPassword(password: string, tenantId: string, key = process.env.EMAIL_ENCRYPTION_KEY): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(key), iv);
  cipher.setAAD(Buffer.from(`cms:email:${tenantId}`));
  const encrypted = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptEmailPassword(value: string, tenantId: string, key = process.env.EMAIL_ENCRYPTION_KEY): string {
  const [version, iv, tag, encrypted, extra] = value.split(":");
  if (version !== "v1" || !iv || !tag || !encrypted || extra !== undefined) throw new Error("Invalid email credential");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(key), Buffer.from(iv, "base64"));
  decipher.setAAD(Buffer.from(`cms:email:${tenantId}`));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8");
}
