import "server-only";

import { getEnv } from "@/lib/env";
import { assetDownloadToken } from "./download-token";

export function assetDownloadUrl(tenantId: string, assetId: string): string {
  const env = getEnv();
  const token = assetDownloadToken(env.BETTER_AUTH_SECRET, tenantId, assetId);
  return new URL(`/api/media/${tenantId}/${assetId}/${token}`, env.BETTER_AUTH_URL).href;
}
