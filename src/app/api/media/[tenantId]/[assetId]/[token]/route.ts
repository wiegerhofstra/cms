import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { assets } from "@/db/schema";
import { getEnv } from "@/lib/env";
import { verifyAssetDownloadToken } from "@/modules/uploads/download-token";
import { serveMedia } from "@/modules/uploads/media";

export async function GET(request: Request, context: RouteContext<"/api/media/[tenantId]/[assetId]/[token]">) {
  const { tenantId, assetId, token } = await context.params;
  const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
  if (!z.uuid().safeParse(tenantId).success || !z.uuid().safeParse(assetId).success ||
    !verifyAssetDownloadToken(getEnv().BETTER_AUTH_SECRET, tenantId, assetId, token)) {
    return new Response("File not found", { status: 404, headers });
  }
  const [asset] = await db.select().from(assets).where(and(
    eq(assets.tenantId, tenantId), eq(assets.id, assetId), eq(assets.status, "ready"), isNull(assets.deletedAt),
  )).limit(1);
  if (!asset) return new Response("File not found", { status: 404, headers });
  return serveMedia(request, asset);
}

export const HEAD = GET;
