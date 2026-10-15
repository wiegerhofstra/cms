import { z } from "zod";

export const presignUploadSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  // Any file type can be uploaded; asset fields can limit what they accept.
  mimeType: z.string().trim().toLowerCase().max(255).regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/, "Enter a valid MIME type"),
  fileSize: z.number().int().positive(),
  modelId: z.uuid().optional(),
  fieldId: z.uuid().optional(),
});

export const completeUploadSchema = z.object({
  uploadToken: z.string().min(1),
  etag: z.string().trim().max(255).optional(),
});

export function assertAllowedUpload(input: { fileSize: number; maxBytes: number }): void {
  if (input.fileSize > input.maxBytes) {
    throw new Error(`File size exceeds ${input.maxBytes} bytes`);
  }
}

export function sanitizeFilename(filename: string): string {
  const sanitized = filename
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  return sanitized || "upload";
}
