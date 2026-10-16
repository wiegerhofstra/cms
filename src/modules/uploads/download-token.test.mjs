import assert from "node:assert/strict";
import { test } from "node:test";
import { assetDownloadToken, verifyAssetDownloadToken } from "./download-token.ts";

test("durable download capabilities are stable and bound to the secret, tenant and asset", () => {
  const token = assetDownloadToken("secret", "tenant-a", "asset-a");
  assert.equal(assetDownloadToken("secret", "tenant-a", "asset-a"), token);
  assert.equal(verifyAssetDownloadToken("secret", "tenant-a", "asset-a", token), true);
  assert.equal(verifyAssetDownloadToken("secret", "tenant-b", "asset-a", token), false);
  assert.equal(verifyAssetDownloadToken("secret", "tenant-a", "asset-b", token), false);
  assert.equal(verifyAssetDownloadToken("rotated", "tenant-a", "asset-a", token), false);
  for (const invalid of ["", token + "x", token.slice(1), "x".repeat(token.length)]) assert.equal(verifyAssetDownloadToken("secret", "tenant-a", "asset-a", invalid), false);
});
