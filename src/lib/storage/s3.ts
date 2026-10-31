import "server-only";

import { DeleteObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";

import { getEnv } from "@/lib/env";

const globalForS3 = globalThis as unknown as {
  cmsS3Client?: S3Client;
  cmsMediaS3Client?: S3Client;
};

/** Media downloads have application-level retries covering both headers and streamed bytes. */
export function getMediaS3Client(): S3Client {
  const env = getEnv();
  return globalForS3.cmsMediaS3Client ??= new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(env.S3_ENDPOINT),
    maxAttempts: 1,
    requestHandler: { connectionTimeout: 3_000, requestTimeout: 15_000 },
    credentials: env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY ? {
      accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    } : undefined,
  });
}

export function getS3Client(): S3Client {
  const env = getEnv();

  if (!globalForS3.cmsS3Client) {
    globalForS3.cmsS3Client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT || undefined,
      forcePathStyle: Boolean(env.S3_ENDPOINT),
      credentials:
        env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
          ? {
              accessKeyId: env.S3_ACCESS_KEY_ID,
              secretAccessKey: env.S3_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
  }

  return globalForS3.cmsS3Client;
}

export async function presignUpload(input: {
  bucket: string;
  objectKey: string;
  mimeType: string;
  maxBytes: number;
}) {
  return createPresignedPost(getS3Client(), {
    Bucket: input.bucket,
    Key: input.objectKey,
    Conditions: [
      ["content-length-range", 1, input.maxBytes],
      ["eq", "$Content-Type", input.mimeType],
    ],
    Fields: {
      "Content-Type": input.mimeType,
    },
    Expires: 600,
  });
}

export async function deleteS3Object(input: { bucket: string; objectKey: string }) {
  await getS3Client().send(
    new DeleteObjectCommand({
      Bucket: input.bucket,
      Key: input.objectKey,
    }),
  );
}

export async function getS3Object(input: { bucket: string; objectKey: string; range?: string }) {
  return getS3Client().send(
    new GetObjectCommand({
      Bucket: input.bucket,
      Key: input.objectKey,
      Range: input.range,
    }),
  );
}

export async function presignRead(input: { bucket: string; objectKey: string; expiresIn?: number }) {
  return getSignedUrl(
    getS3Client(),
    new GetObjectCommand({
      Bucket: input.bucket,
      Key: input.objectKey,
    }),
    { expiresIn: input.expiresIn ?? 300 },
  );
}
