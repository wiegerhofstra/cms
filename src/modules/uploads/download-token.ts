import { createHmac, timingSafeEqual } from "node:crypto";

/** A durable, narrowly scoped capability, issued only by authenticated content delivery. */
export function assetDownloadToken(secret: string, tenantId: string, assetId: string): string {
  return createHmac("sha256", secret).update(`cms:asset-download:v1:${tenantId}:${assetId}`).digest("base64url");
}

export function verifyAssetDownloadToken(secret: string, tenantId: string, assetId: string, token: string): boolean {
  const expected = Buffer.from(assetDownloadToken(secret, tenantId, assetId));
  const received = Buffer.from(token);
  return received.length === expected.length && timingSafeEqual(expected, received);
}
