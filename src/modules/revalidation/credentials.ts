import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

function encryptionKey(secret: string | undefined) {
  if (!secret || secret.length < 32) throw new Error("Revalidation credential storage is unavailable");
  return Buffer.from(hkdfSync("sha256", secret, "cms:revalidation", "token-encryption:v1", 32));
}

export function encryptRevalidationToken(token: string, tenantId: string, secret = process.env.BETTER_AUTH_SECRET) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  cipher.setAAD(Buffer.from(`cms:revalidation:${tenantId}`));
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptRevalidationToken(value: string, tenantId: string, secret = process.env.BETTER_AUTH_SECRET) {
  const [version, iv, tag, encrypted, extra] = value.split(":");
  if (version !== "v1" || !iv || !tag || !encrypted || extra !== undefined) throw new Error("Invalid revalidation credential");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), Buffer.from(iv, "base64"));
  decipher.setAAD(Buffer.from(`cms:revalidation:${tenantId}`));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8");
}
