import { createHash } from "node:crypto";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { load } from "js-yaml";
import sharp from "sharp";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export const checksum = (value) => createHash("sha256").update(value).digest("hex");

export function stableId(tenantId, key) {
  const bytes = createHash("sha1").update(Buffer.from(tenantId.replaceAll("-", ""), "hex")).update(key).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function readMedia(root, tenantId, bucket) {
  root = await realpath(root);
  const result = [];
  for (const uid of (await readdir(root, { recursive: true })).sort()) {
    if (uid.endsWith(".meta.yml")) continue;
    const filename = path.join(root, uid);
    if (!(await stat(filename)).isFile()) continue;
    const resolved = await realpath(filename);
    if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error("Media path escapes dump directory");
    const body = await readFile(filename);
    const info = await sharp(body).metadata();
    const mimeType = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", tiff: "image/tiff", svg: "image/svg+xml", avif: "image/avif" }[info.format];
    if (!mimeType) throw new Error(`Unsupported media format: ${uid}`);
    let metadata = {};
    try { metadata = load(await readFile(`${filename}.meta.yml`, "utf8")) ?? {}; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    const sha256 = checksum(body);
    const id = stableId(tenantId, `dragonfly:${uid}:${sha256}`);
    const originalName = typeof metadata.name === "string" ? metadata.name : path.basename(uid);
    const safeName = originalName.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
    result.push({ id, uid, filename, bucket, objectKey: `${tenantId}/imports/ommelanden/${id}/${safeName}`,
      originalName, mimeType, sizeBytes: body.length, sha256, imageWidth: info.width, imageHeight: info.height });
  }
  return result;
}

export function storageClient() {
  return new S3Client({
    region: process.env.S3_REGION ?? "us-east-1", endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(process.env.S3_ENDPOINT),
    credentials: process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY ? {
      accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    } : undefined,
  });
}

export async function uploadMedia(client, assets, progress = () => {}) {
  let next = 0;
  let completed = 0;
  let failure;
  // Wait for every in-flight upload even if one fails. Never delete or overwrite objects.
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (!failure && next < assets.length) {
      const asset = assets[next++];
      try {
        const body = await readFile(asset.filename);
        if (checksum(body) !== asset.sha256) throw new Error(`Source media changed: ${asset.uid}`);
        let head;
        try { head = await client.send(new HeadObjectCommand({ Bucket: asset.bucket, Key: asset.objectKey })); }
        catch (error) { if (error.$metadata?.httpStatusCode !== 404) throw error; }
        if (!head) {
          try {
            await client.send(new PutObjectCommand({ Bucket: asset.bucket, Key: asset.objectKey, Body: body,
              ContentType: asset.mimeType, IfNoneMatch: "*", Metadata: { sha256: asset.sha256, source: "ommelanden" } }));
          } catch (error) { if (error.$metadata?.httpStatusCode !== 412) throw error; }
        } else if (head.ContentLength !== asset.sizeBytes || head.Metadata?.sha256 !== asset.sha256) {
          throw new Error(`Destination object conflicts with source: ${asset.uid}`);
        }
        const remote = await client.send(new GetObjectCommand({ Bucket: asset.bucket, Key: asset.objectKey }));
        const hash = createHash("sha256");
        for await (const chunk of remote.Body) hash.update(chunk);
        if (hash.digest("hex") !== asset.sha256) throw new Error(`Uploaded checksum mismatch: ${asset.uid}`);
        asset.etag = remote.ETag ?? null;
        progress(++completed, assets.length);
      } catch (error) { failure = error; }
    }
  }));
  if (failure) throw failure;
}
