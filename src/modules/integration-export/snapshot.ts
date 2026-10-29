import { createHash } from "node:crypto";

/** Sync snapshots omit volatile metadata, but hash every guide, example and helper. */
export function createDocumentationSnapshot(tenantSlug: string, exportedFiles: Record<string, string>) {
  const manifest = JSON.parse(exportedFiles["manifest.json"]);
  delete manifest.generatedAt;
  const files = Object.fromEntries(Object.entries({
    ...exportedFiles,
    "manifest.json": `${JSON.stringify(manifest, null, 2)}\n`,
  }).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  return {
    version: 1,
    tenantSlug,
    contentHash: createHash("sha256").update(JSON.stringify(files)).digest("hex"),
    files,
  };
}
