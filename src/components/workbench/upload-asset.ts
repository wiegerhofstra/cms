import type { AssetWithPreview } from "@/lib/cms/types";
import { completeUploadAction, presignUploadAction } from "./actions";

/** Uploads the file straight to storage with a presigned POST, then registers it as a ready asset. */
export async function uploadAsset(tenantSlug: string, file: File): Promise<AssetWithPreview> {
  const presigned = await presignUploadAction(tenantSlug, { filename: file.name, mimeType: file.type || "application/octet-stream", fileSize: file.size });
  const formData = new FormData();
  for (const [key, value] of Object.entries(presigned.upload.fields)) {
    formData.append(key, value);
  }
  formData.append("file", file);
  const response = await fetch(presigned.upload.url, { method: "POST", body: formData });
  if (!response.ok) throw new Error("S3 upload failed");
  const { asset } = await completeUploadAction(tenantSlug, { uploadToken: presigned.uploadToken });
  return asset;
}
