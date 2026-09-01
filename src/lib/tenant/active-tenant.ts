import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

import { getEnv } from "@/lib/env";

const ACTIVE_TENANT_COOKIE = "cms_active_tenant";

export async function getActiveTenantId(): Promise<string | null> {
  const value = (await cookies()).get(ACTIVE_TENANT_COOKIE)?.value;
  if (!value) return null;

  const [tenantId, signature] = value.split(".");
  if (!tenantId || !signature) return null;

  return verifySignature(tenantId, signature) ? tenantId : null;
}

export async function setActiveTenantId(tenantId: string): Promise<void> {
  (await cookies()).set(ACTIVE_TENANT_COOKIE, `${tenantId}.${sign(tenantId)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

function sign(value: string): string {
  return createHmac("sha256", getEnv().BETTER_AUTH_SECRET).update(value).digest("base64url");
}

function verifySignature(value: string, signature: string): boolean {
  const expected = sign(value);

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}
