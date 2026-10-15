import assert from "node:assert/strict";
import { test } from "node:test";
import { allowedAssetTypes, assetAcceptAttribute, describeAllowedAssetTypes, isAssetTypeAllowed, withAllowedAssetTypes } from "./asset-types.ts";

test("without a limit every file is allowed", () => {
  assert.deepEqual(allowedAssetTypes({}), []);
  assert.equal(isAssetTypeAllowed([], { mimeType: "application/octet-stream", name: "data.bin" }), true);
  assert.equal(assetAcceptAttribute([]), undefined);
  assert.equal(describeAllowedAssetTypes([]), "Any file type");
});

test("files match a category by MIME type or, when the browser gives none, by extension", () => {
  assert.equal(isAssetTypeAllowed(["image"], { mimeType: "image/webp", name: "photo" }), true);
  assert.equal(isAssetTypeAllowed(["image"], { mimeType: "application/pdf", name: "file.pdf" }), false);
  assert.equal(isAssetTypeAllowed(["archive"], { mimeType: "application/octet-stream", name: "Bundle.ZIP" }), true);
  assert.equal(isAssetTypeAllowed(["archive", "pdf"], { mimeType: "application/pdf", name: "x" }), true);
  assert.equal(isAssetTypeAllowed(["document"], { mimeType: "text/csv; charset=utf-8", name: "x" }), true);
});

test("config keeps known categories in a stable order and drops the key when unlimited", () => {
  assert.deepEqual(allowedAssetTypes({ allowedTypes: ["pdf", "bogus", "image"] }), ["image", "pdf"]);
  assert.deepEqual(withAllowedAssetTypes({ other: 1 }, ["pdf", "image"]), { other: 1, allowedTypes: ["image", "pdf"] });
  assert.deepEqual(withAllowedAssetTypes({ other: 1, allowedTypes: ["pdf"] }, []), { other: 1 });
  assert.equal(describeAllowedAssetTypes(["image", "pdf", "archive"]), "Images, PDFs or Archives");
  assert.match(assetAcceptAttribute(["image", "pdf"]), /^image\/\*,.*application\/pdf/);
});
