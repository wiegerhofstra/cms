import "server-only";

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { createWriteStream } from "node:fs";
import { addAbortSignal, Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import { getEnv } from "@/lib/env";
import { getMediaS3Client } from "@/lib/storage/s3";
import { AssetByteCache, OriginBusyError, OriginLimiter, retryOrigin } from "./byte-cache";
import { mediaHeaders, mediaNotModified, mediaRequestRange, type ByteRange, type MediaAsset } from "./media-http";

const globalForMedia = globalThis as unknown as {
  cmsMediaCache?: { cache: AssetByteCache; limiter: OriginLimiter };
};

function storage() {
  const env = getEnv();
  return globalForMedia.cmsMediaCache ??= {
    cache: new AssetByteCache(env.ASSET_CACHE_DIR, env.ASSET_CACHE_MAX_BYTES, env.ASSET_CACHE_MAX_OBJECT_BYTES),
    limiter: new OriginLimiter(env.ASSET_ORIGIN_CONCURRENCY),
  };
}

async function originBody(asset: MediaAsset, signal: AbortSignal, range?: ByteRange): Promise<Readable> {
  const object = await getMediaS3Client().send(new GetObjectCommand({
    Bucket: asset.bucket, Key: asset.objectKey,
    Range: range ? `bytes=${range.start}-${range.end}` : undefined,
  }), { abortSignal: signal });
  if (!(object.Body instanceof Readable)) throw new Error("S3 did not return an asset body");
  return addAbortSignal(signal, object.Body);
}

async function fillCache(asset: MediaAsset, destination: string, limiter: OriginLimiter) {
  const release = await limiter.acquire();
  try {
    await retryOrigin(async (signal) => {
      const body = await originBody(asset, signal);
      let bytes = 0;
      const bounded = new Transform({ transform(chunk, _encoding, callback) {
        bytes += chunk.length;
        callback(bytes > asset.sizeBytes ? new Error("Asset exceeds its declared size") : null, chunk);
      } });
      await pipeline(body, bounded, createWriteStream(destination, { mode: 0o600 }), { signal });
      if (bytes !== asset.sizeBytes) {
        throw Object.assign(new Error("Incomplete asset download"), { code: "ERR_STREAM_PREMATURE_CLOSE" });
      }
    });
  } finally { release(); }
}

async function bypassCache(asset: MediaAsset, range: ByteRange | null, limiter: OriginLimiter) {
  const release = await limiter.acquire();
  try {
    // Once headers/bytes have been sent we cannot retry a stream. Clients can retry the stable URL.
    const body = await retryOrigin((signal) => originBody(asset, signal, range ?? undefined));
    body.once("close", release);
    body.once("end", release);
    body.once("error", release);
    if (body.destroyed || body.readableEnded) release();
    return Readable.toWeb(body) as ReadableStream<Uint8Array>;
  } catch (error) { release(); throw error; }
}

/** Invoke only after checking the capability and the ready, non-deleted asset in its tenant. */
export async function serveMedia(request: Request, asset: MediaAsset): Promise<Response> {
  const headers = mediaHeaders(asset);
  if (mediaNotModified(request, headers)) return new Response(null, { status: 304, headers });
  const range = mediaRequestRange(request, headers, asset.sizeBytes);
  if (range === "unsatisfiable") {
    headers.set("Content-Range", `bytes */${asset.sizeBytes}`);
    headers.set("Cache-Control", "private, no-store");
    return new Response(null, { status: 416, headers });
  }
  const length = range ? range.end - range.start + 1 : asset.sizeBytes;
  headers.set("Content-Length", String(length));
  if (range) headers.set("Content-Range", `bytes ${range.start}-${range.end}/${asset.sizeBytes}`);
  if (request.method === "HEAD") return new Response(null, { status: 200, headers });
  const { cache, limiter } = storage();
  try {
    let body: ReadableStream<Uint8Array> | undefined;
    if (cache.canCache(asset.sizeBytes)) {
      try {
        const cached = await cache.get(asset, (destination) => fillCache(asset, destination, limiter));
        headers.set("X-Asset-Cache", cached.status);
        // Opening the file before returning it keeps an active stream valid during eviction.
        body = Readable.toWeb(cached.file.createReadStream(range ?? {})) as ReadableStream<Uint8Array>;
      } catch (error) {
        if (!["EACCES", "EPERM", "EROFS", "ENOSPC", "EDQUOT"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
        console.error("Asset disk cache unavailable", { code: (error as NodeJS.ErrnoException).code });
      }
    }
    if (!body) {
      headers.set("X-Asset-Cache", "BYPASS");
      body = await bypassCache(asset, range, limiter);
    }
    return new Response(body, { status: range ? 206 : 200, headers });
  } catch (error) {
    const requestId = crypto.randomUUID();
    const value = error as { name?: string; code?: string; $metadata?: { httpStatusCode?: number; requestId?: string } };
    // Never log bearer URLs, signatures, keys, or raw SDK error messages.
    console.error("Asset delivery failed", {
      requestId, assetId: asset.id, name: value?.name, code: value?.code,
      originStatus: value?.$metadata?.httpStatusCode, originRequestId: value?.$metadata?.requestId,
    });
    return new Response("Asset temporarily unavailable", { status: error instanceof OriginBusyError ? 503 : 502,
      headers: { "Cache-Control": "private, no-store", "Retry-After": "5", "X-Request-Id": requestId, "Referrer-Policy": "no-referrer" },
    });
  }
}
