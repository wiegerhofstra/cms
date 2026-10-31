import { assetCacheKey, type CacheAsset } from "./byte-cache.ts";

export type MediaAsset = CacheAsset & { originalName: string; mimeType: string; createdAt: Date };
export type ByteRange = { start: number; end: number };

/** Ignore unsupported/multiple ranges; reject an unsatisfiable single byte range. */
export function mediaRange(value: string | null, size: number): ByteRange | null | "unsatisfiable" {
  if (!value || value.includes(",")) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  if (size === 0) return "unsatisfiable";
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) return "unsatisfiable";
  return { start, end: Math.min(end, size - 1) };
}

export function mediaHeaders(asset: MediaAsset): Headers {
  const mime = /^[\w.+-]+\/[\w.+-]+$/.test(asset.mimeType) ? asset.mimeType : "application/octet-stream";
  const inline = /^(image\/(avif|bmp|gif|jpeg|png|webp|x-icon)|audio\/[\w.+-]+|video\/[\w.+-]+|application\/pdf)$/.test(mime);
  const filename = encodeURIComponent(asset.originalName.toWellFormed()).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return new Headers({
    // Always recheck capability and live DB status, even when bytes are cached on disk.
    "Cache-Control": "private, no-cache, must-revalidate",
    "Content-Type": mime,
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${filename}`,
    "Content-Security-Policy": "sandbox; default-src 'none'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Access-Control-Allow-Origin": "*",
    "Accept-Ranges": "bytes",
    ETag: `"${assetCacheKey(asset)}"`,
    "Last-Modified": asset.createdAt.toUTCString(),
  });
}

export function mediaNotModified(request: Request, headers: Headers): boolean {
  const etags = request.headers.get("if-none-match");
  if (etags !== null) return etags.split(",").some((tag) => tag.trim() === "*" || tag.trim().replace(/^W\//, "") === headers.get("etag"));
  const since = request.headers.get("if-modified-since");
  return since !== null && Date.parse(since) >= Date.parse(headers.get("last-modified")!);
}

export function mediaRequestRange(request: Request, headers: Headers, size: number) {
  if (request.method !== "GET") return null;
  const ifRange = request.headers.get("if-range");
  if (ifRange && ifRange !== headers.get("etag") && ifRange !== headers.get("last-modified")) return null;
  return mediaRange(request.headers.get("range"), size);
}
