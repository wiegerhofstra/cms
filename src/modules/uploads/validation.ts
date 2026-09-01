import { z } from "zod";

export const presignUploadSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(120),
  fileSize: z.number().int().positive(),
  modelId: z.uuid().optional(),
  fieldId: z.uuid().optional(),
});

export const completeUploadSchema = z.object({
  uploadToken: z.string().min(1),
  etag: z.string().trim().max(255).optional(),
});

export function assertAllowedUpload(input: { mimeType: string; fileSize: number; maxBytes: number }): void {
  if (input.fileSize > input.maxBytes) {
    throw new Error(`File size exceeds ${input.maxBytes} bytes`);
  }

  if (!isAllowedMimeType(input.mimeType)) {
    throw new Error("Only images and PDFs are supported");
  }
}

export function isAllowedMimeType(mimeType: string): boolean {
  return mimeType.startsWith("image/") || mimeType === "application/pdf";
}

export function sanitizeFilename(filename: string): string {
  const sanitized = filename
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  return sanitized || "upload";
}
