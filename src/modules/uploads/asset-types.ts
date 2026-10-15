/** Kinds of files an asset field can be limited to, stored as `config.allowedTypes`. No limit means any file. */
export const assetTypeCategories = ["image", "video", "audio", "pdf", "document", "archive"] as const;
export type AssetTypeCategory = (typeof assetTypeCategories)[number];

type AssetTypeDefinition = { label: string; mimeTypes: string[]; extensions: string[] };

// Extensions back up MIME types, which browsers leave empty or generic for some files (archives especially).
const definitions: Record<AssetTypeCategory, AssetTypeDefinition> = {
  image: { label: "Images", mimeTypes: ["image/*"], extensions: [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg", ".heic"] },
  video: { label: "Videos", mimeTypes: ["video/*"], extensions: [".mp4", ".mov", ".webm", ".m4v"] },
  audio: { label: "Audio", mimeTypes: ["audio/*"], extensions: [".mp3", ".wav", ".m4a", ".ogg", ".flac"] },
  pdf: { label: "PDFs", mimeTypes: ["application/pdf"], extensions: [".pdf"] },
  document: {
    label: "Documents",
    mimeTypes: [
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.oasis.opendocument.text",
      "application/vnd.oasis.opendocument.spreadsheet",
      "application/vnd.oasis.opendocument.presentation",
      "application/rtf",
      "text/plain",
      "text/csv",
    ],
    extensions: [".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods", ".odp", ".rtf", ".txt", ".csv"],
  },
  archive: {
    label: "Archives",
    mimeTypes: [
      "application/zip",
      "application/x-zip-compressed",
      "application/gzip",
      "application/x-gzip",
      "application/x-tar",
      "application/x-7z-compressed",
      "application/vnd.rar",
      "application/x-rar-compressed",
    ],
    extensions: [".zip", ".gz", ".tgz", ".tar", ".7z", ".rar"],
  },
};

export function assetTypeLabel(category: AssetTypeCategory): string {
  return definitions[category].label;
}

/** The field's allowed categories; empty when any file is allowed. */
export function allowedAssetTypes(config: Record<string, unknown>): AssetTypeCategory[] {
  const value = config.allowedTypes;
  if (!Array.isArray(value)) return [];
  return assetTypeCategories.filter((category) => value.includes(category));
}

export function withAllowedAssetTypes(config: Record<string, unknown>, allowed: AssetTypeCategory[]): Record<string, unknown> {
  const next = { ...config };
  if (allowed.length) next.allowedTypes = assetTypeCategories.filter((category) => allowed.includes(category));
  else delete next.allowedTypes;
  return next;
}

export function isAssetTypeAllowed(allowed: AssetTypeCategory[], file: { mimeType: string; name: string }): boolean {
  if (!allowed.length) return true;
  const mimeType = file.mimeType.toLowerCase().split(";")[0]!.trim();
  const name = file.name.toLowerCase();
  return allowed.some((category) => {
    const { mimeTypes, extensions } = definitions[category];
    return (
      mimeTypes.some((type) => (type.endsWith("/*") ? mimeType.startsWith(type.slice(0, -1)) : mimeType === type)) ||
      extensions.some((extension) => name.endsWith(extension))
    );
  });
}

/** Value for a file input's `accept` attribute, or undefined when any file is allowed. */
export function assetAcceptAttribute(allowed: AssetTypeCategory[]): string | undefined {
  if (!allowed.length) return undefined;
  return allowed.flatMap((category) => [...definitions[category].mimeTypes, ...definitions[category].extensions]).join(",");
}

export function describeAllowedAssetTypes(allowed: AssetTypeCategory[]): string {
  if (!allowed.length) return "Any file type";
  const labels = allowed.map(assetTypeLabel);
  return labels.length === 1 ? labels[0]! : `${labels.slice(0, -1).join(", ")} or ${labels.at(-1)}`;
}
