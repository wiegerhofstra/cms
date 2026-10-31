# Asset delivery cache

The Content API's `url` and `downloadUrl` now both point to the existing
`/api/media/{tenantId}/{assetId}/{token}` route. That route serves bytes instead of
redirecting to an expiring S3 URL. No database migration or external CDN is needed.

The route verifies the file-specific capability and queries the live, tenant-scoped
asset record before serving any bytes, including cached responses, HEAD, and 304.
Deleted/pending assets and invalid capabilities return an uncached 404. Anyone
holding a valid URL can read that file, as with the previous durable download URL.
Rotating `BETTER_AUTH_SECRET` invalidates old URLs immediately on subsequent requests.
An already-started download can finish. Downloaded copies cannot be recalled.

## Server configuration

Defaults work on a Node server with a writable working directory:

```dotenv
ASSET_CACHE_DIR=".cache/assets"
ASSET_CACHE_MAX_BYTES="1073741824"
ASSET_CACHE_MAX_OBJECT_BYTES="134217728"
ASSET_ORIGIN_CONCURRENCY="4"
```

- Mount a **persistent private directory** at `ASSET_CACHE_DIR` in production,
  for example `/var/cache/cms/assets`. Grant the CMS process read/write access.
  Keep it outside `public/` and outside any static web-server root; the files
  must only be served through the authorized media route. It need not be backed up.
- The default completed-file budget is 1 GiB. Oldest cached files are evicted when
  making room. Active streams retain their open file handles during eviction.
- Files up to 128 MiB are cached by default; larger files stream directly from S3
  with `X-Asset-Cache: BYPASS`. They still use the origin concurrency limit.
- Allow additional disk space for in-progress downloads: up to the concurrency
  limit times the maximum cached file size. Files are streamed to disk, not held
  whole in application memory. Partial writes are never made visible, and abandoned
  temporary files older than an hour are cleaned during later cache fills.
- Cache entries survive process restarts when the directory survives. Containers
  with ephemeral storage will start cold after a restart unless a volume is mounted.
- Each Node process owns its queue, coalescing map, and disk budget. Give separate
  processes/replicas separate directories and account for their aggregate origin
  concurrency. This is not a distributed cache; do not share one directory between
  processes when relying on the configured capacity bound.

An uncached file is fetched once for concurrent requests within one process.
At most four origin downloads run concurrently by default, with a bounded queue
and a 15-second queue wait. Transient origin failures are retried up to three total
attempts with exponential backoff and jitter, a 3-second connection timeout, and
a 15-second deadline per attempt. The deadline includes reading the response body.
The SDK's separate media client does not add another layer of retries.

Cached bytes remain available during an S3 outage; authorization still needs the
database. An uncached file still depends on S3. Errors and incomplete downloads are
never cached. Exhausted queues return 503; failed origin downloads return 502,
with `Retry-After: 5` and `X-Request-Id`. Once an uncached oversized response starts
streaming, a mid-stream failure cannot be retried inside that response.

If the cache directory is unwritable or full, the route logs a sanitized error and
falls back to streaming from S3. Monitor these errors: sustained bypass loses the
protection provided by caching.

## HTTP behavior and access

Media responses use `Cache-Control: private, no-cache, must-revalidate`.
Browsers can keep bytes but must revalidate access; matching ETags return 304
without a disk or S3 read. HEAD also needs no S3 request. Single byte ranges and
`If-Range` are supported for PDFs/video; multipart ranges are ignored and return
the whole file. Invalid/unsatisfiable single ranges return 416.

Active file types such as HTML and SVG are served as attachments, with a sandbox
CSP and `nosniff`, because the CMS now serves user-uploaded bytes on its own origin.
Images in supported raster formats, PDF, audio, and video can be displayed inline.

File contents must be immutable: replacing a file means creating a new asset ID
and object key, as the CMS upload flow already does. The disk key includes tenant,
asset, bucket, object key, ETag, and size. Do not overwrite objects out-of-band.
Deleting an asset revokes access through the live DB check even if its bytes remain
on disk until eviction. Renaming a file does not require a new byte download.

Do not override these responses with public/immutable caching in a consumer or
reverse proxy: that bypasses per-request revocation. A future CDN integration
needs edge authorization or an explicitly accepted revocation window and purging.

## Rollout and verification

1. Deploy the CMS changes and configure the persistent cache directory.
2. Revalidate/rebuild consumer content once to replace previously cached S3 URLs.
   Existing durable `downloadUrl` links automatically use the new byte-serving route.
3. Consumers can render the returned `url` directly. Existing `/media/{assetId}`
   integrations continue to work. Refresh the generated integration documentation.
4. If a consumer uses Next Image, allow the CMS origin and `/api/media/**` path in
   its `images.remotePatterns`; previously it may only have allowed the S3 hostname.
   A separate image optimizer can retain its own copies after CMS deletion, so its
   invalidation/access policy must match the consumer's requirements.
5. Fetch one valid media URL twice. Expect identical bytes with `X-Asset-Cache: MISS`
   followed by `HIT` (simultaneous cold requests can show `COALESCED`). Confirm Range
   returns 206, HEAD has no body, and a matching `If-None-Match` returns 304.
6. Confirm deleting a test asset blocks its warmed URL and conditional requests.

Delivery error logs deliberately omit signed URLs and raw S3 error messages. Use the request ID,
asset ID, origin status, and origin request ID to investigate upstream failures.

Run `npm run test:uploads`, `npm run test:uploads:integration`, and
`npm run test:integration`. The upload integration test uses temporary database
fixtures and a local fake S3 server; it never uploads to production object storage.
Set `CMS_TEST_ORIGIN=http://localhost:3012` to also exercise a running local Next app.
