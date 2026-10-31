import assert from "node:assert/strict";
import { test } from "node:test";
import { mediaHeaders, mediaNotModified, mediaRange, mediaRequestRange } from "./media-http.ts";

const asset = { tenantId: "tenant", id: "asset", bucket: "bucket", objectKey: "key", etag: null, sizeBytes: 100, originalName: "résumé.pdf", mimeType: "application/pdf", createdAt: new Date("2026-01-01T12:00:00Z") };
const request = (headers, method = "GET") => new Request("https://cms.invalid/media", { headers, method });

test("media supports closed, open-ended and suffix ranges without accepting invalid offsets", () => {
  assert.deepEqual(mediaRange("bytes=10-19", 100), { start: 10, end: 19 });
  assert.deepEqual(mediaRange("bytes=90-", 100), { start: 90, end: 99 });
  assert.deepEqual(mediaRange("bytes=-10", 100), { start: 90, end: 99 });
  assert.deepEqual(mediaRange("bytes=90-200", 100), { start: 90, end: 99 });
  assert.deepEqual(mediaRange("bytes=-200", 100), { start: 0, end: 99 });
  for (const value of ["bytes=100-", "bytes=50-49", "bytes=-0", "bytes=99999999999999999999-"]) assert.equal(mediaRange(value, 100), "unsatisfiable");
  assert.equal(mediaRange("bytes=0-", 0), "unsatisfiable");
  for (const value of [null, "bad", "bytes=-", "bytes=0-1,4-5", "items=0-1"]) assert.equal(mediaRange(value, 100), null);
});

test("conditional requests prefer If-None-Match and honor If-Range", () => {
  const headers = mediaHeaders(asset);
  const etag = headers.get("etag");
  assert.equal(mediaNotModified(request({ "If-None-Match": `"other", W/${etag}` }), headers), true);
  assert.equal(mediaNotModified(request({ "If-Modified-Since": headers.get("last-modified") }), headers), true);
  assert.equal(mediaNotModified(request({ "If-None-Match": '"other"', "If-Modified-Since": "Thu, 01 Jan 2099 00:00:00 GMT" }), headers), false);
  assert.deepEqual(mediaRequestRange(request({ Range: "bytes=0-9", "If-Range": etag }), headers, 100), { start: 0, end: 9 });
  assert.equal(mediaRequestRange(request({ Range: "bytes=0-9", "If-Range": `W/${etag}` }), headers, 100), null);
  assert.equal(mediaRequestRange(request({ Range: "bytes=0-9" }, "HEAD"), headers, 100), null);
});

test("media remains private/revalidated and active content cannot execute on the CMS origin", () => {
  const headers = mediaHeaders(asset);
  assert.equal(headers.get("cache-control"), "private, no-cache, must-revalidate");
  assert.equal(headers.get("content-disposition"), "inline; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf");
  for (const mimeType of ["text/html", "application/xhtml+xml", "image/svg+xml", "application/javascript"]) {
    const unsafe = mediaHeaders({ ...asset, mimeType, originalName: "a\r\nX-Foo: evil.html" });
    assert.match(unsafe.get("content-disposition"), /^attachment;/);
    assert.match(unsafe.get("content-security-policy"), /sandbox/);
    assert.equal(unsafe.get("x-content-type-options"), "nosniff");
    assert.equal(unsafe.has("X-Foo"), false);
  }
});
