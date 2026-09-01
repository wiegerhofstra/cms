import "server-only";

import { getS3Object } from "@/lib/storage/s3";

type ImageDimensions = {
  imageWidth: number | null;
  imageHeight: number | null;
};

const EMPTY_DIMENSIONS: ImageDimensions = { imageWidth: null, imageHeight: null };
const DIMENSION_READ_RANGE = "bytes=0-65535";

export async function extractImageDimensions(input: {
  bucket: string;
  objectKey: string;
  mimeType: string;
}): Promise<ImageDimensions> {
  if (!input.mimeType.startsWith("image/")) return EMPTY_DIMENSIONS;

  const object = await getS3Object({
    bucket: input.bucket,
    objectKey: input.objectKey,
    range: DIMENSION_READ_RANGE,
  });
  const bytes = await object.Body?.transformToByteArray();

  if (!bytes) return EMPTY_DIMENSIONS;

  return dimensionsFromBytes(bytes) ?? EMPTY_DIMENSIONS;
}

function dimensionsFromBytes(bytes: Uint8Array): ImageDimensions | null {
  return pngDimensions(bytes) ?? jpegDimensions(bytes) ?? gifDimensions(bytes) ?? webpDimensions(bytes);
}

function pngDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 24) return null;
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null;

  return {
    imageWidth: readUInt32BE(bytes, 16),
    imageHeight: readUInt32BE(bytes, 20),
  };
}

function jpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker >= 0xd0 && marker <= 0xd7) {
      offset += 2;
      continue;
    }

    const segmentLength = readUInt16BE(bytes, offset + 2);
    if (segmentLength < 2 || offset + 2 + segmentLength > bytes.length) return null;

    if (isJpegStartOfFrame(marker)) {
      return {
        imageWidth: readUInt16BE(bytes, offset + 7),
        imageHeight: readUInt16BE(bytes, offset + 5),
      };
    }

    offset += 2 + segmentLength;
  }

  return null;
}

function gifDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 10) return null;
  const isGif = bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46;
  if (!isGif) return null;

  return {
    imageWidth: readUInt16LE(bytes, 6),
    imageHeight: readUInt16LE(bytes, 8),
  };
}

function webpDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 30) return null;
  if (!asciiEquals(bytes, 0, "RIFF") || !asciiEquals(bytes, 8, "WEBP")) return null;

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkType = ascii(bytes, offset, 4);
    const chunkSize = readUInt32LE(bytes, offset + 4);
    const dataOffset = offset + 8;

    if (chunkType === "VP8 " && dataOffset + 10 <= bytes.length) {
      return {
        imageWidth: readUInt16LE(bytes, dataOffset + 6) & 0x3fff,
        imageHeight: readUInt16LE(bytes, dataOffset + 8) & 0x3fff,
      };
    }

    if (chunkType === "VP8L" && dataOffset + 5 <= bytes.length) {
      const b0 = bytes[dataOffset + 1];
      const b1 = bytes[dataOffset + 2];
      const b2 = bytes[dataOffset + 3];
      const b3 = bytes[dataOffset + 4];
      return {
        imageWidth: 1 + (((b1 & 0x3f) << 8) | b0),
        imageHeight: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
      };
    }

    if (chunkType === "VP8X" && dataOffset + 10 <= bytes.length) {
      return {
        imageWidth: 1 + readUInt24LE(bytes, dataOffset + 4),
        imageHeight: 1 + readUInt24LE(bytes, dataOffset + 7),
      };
    }

    offset = dataOffset + chunkSize + (chunkSize % 2);
  }

  return null;
}

function isJpegStartOfFrame(marker: number): boolean {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function readUInt16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUInt16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUInt24LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readUInt32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function readUInt32LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function asciiEquals(bytes: Uint8Array, offset: number, value: string): boolean {
  return ascii(bytes, offset, value.length) === value;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(bytes[offset + index]);
  }
  return value;
}
