import "server-only";

import { createHash, randomBytes } from "node:crypto";

const tokenPrefix = "cms_at_";

export function generateAccessToken(): { token: string; tokenHash: string; tokenHint: string } {
  const token = `${tokenPrefix}${randomBytes(32).toString("base64url")}`;

  return {
    token,
    tokenHash: hashAccessToken(token),
    tokenHint: `${token.slice(0, tokenPrefix.length + 8)}...${token.slice(-4)}`,
  };
}

export function hashAccessToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
