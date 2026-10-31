import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readdir, rename, rm, stat, type FileHandle } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export type CacheAsset = {
  tenantId: string; id: string; bucket: string; objectKey: string; etag: string | null; sizeBytes: number;
};

export function assetCacheKey(asset: CacheAsset): string {
  return createHash("sha256").update(JSON.stringify([
    asset.tenantId, asset.id, asset.bucket, asset.objectKey, asset.etag, asset.sizeBytes,
  ])).digest("hex");
}

export class OriginBusyError extends Error {}

/** Per-process admission control. Bound both active downloads and waiting requests. */
export class OriginLimiter {
  private active = 0;
  private waiting: Array<() => void> = [];
  private concurrency: number;
  private maxWaiting: number;
  private waitMs: number;

  constructor(concurrency: number, maxWaiting = 32, waitMs = 15_000) {
    this.concurrency = concurrency;
    this.maxWaiting = maxWaiting;
    this.waitMs = waitMs;
  }

  async acquire(): Promise<() => void> {
    if (this.active < this.concurrency) this.active++;
    else {
      if (this.waiting.length >= this.maxWaiting) throw new OriginBusyError("Asset origin queue is full");
      await new Promise<void>((resolve, reject) => {
        const ready = () => { clearTimeout(timer); resolve(); };
        const timer = setTimeout(() => {
          this.waiting = this.waiting.filter((item) => item !== ready);
          reject(new OriginBusyError("Asset origin queue timed out"));
        }, this.waitMs);
        this.waiting.push(ready);
      });
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    };
  }
}

export function retryableOriginError(error: unknown): boolean {
  const value = error as { name?: string; code?: string; $metadata?: { httpStatusCode?: number } };
  const status = value?.$metadata?.httpStatusCode;
  return status === 429 || (status !== undefined && status >= 500) ||
    ["AbortError", "TimeoutError", "SlowDown", "RequestTimeout"].includes(value?.name ?? "") ||
    ["ECONNRESET", "ETIMEDOUT", "EPIPE", "EAI_AGAIN", "ERR_STREAM_PREMATURE_CLOSE"].includes(value?.code ?? "");
}

/** Retry the entire download, including a failing body, with a fresh deadline per attempt. */
export async function retryOrigin<T>(operation: (signal: AbortSignal) => Promise<T>, options: {
  attempts?: number; timeoutMs?: number; delayMs?: number;
} = {}): Promise<T> {
  const { attempts = 3, timeoutMs = 15_000, delayMs = 200 } = options;
  for (let attempt = 0; ; attempt++) {
    try { return await operation(AbortSignal.timeout(timeoutMs)); }
    catch (error) {
      if (attempt + 1 >= attempts || !retryableOriginError(error)) throw error;
      await delay(delayMs * 2 ** attempt * (0.5 + Math.random()));
    }
  }
}

/** Immutable bytes only. Callers MUST authorize and check the asset's live status before every read. */
export class AssetByteCache {
  private pending = new Map<string, Promise<void>>();
  private commit: Promise<void> = Promise.resolve();
  readonly directory: string;
  readonly maxBytes: number;
  readonly maxObjectBytes: number;

  constructor(directory: string, maxBytes: number, maxObjectBytes: number) {
    this.directory = directory;
    this.maxBytes = maxBytes;
    this.maxObjectBytes = maxObjectBytes;
  }

  canCache(size: number): boolean {
    return Number.isSafeInteger(size) && size >= 0 && size <= Math.min(this.maxBytes, this.maxObjectBytes);
  }

  private filename(key: string): string { return path.join(this.directory, `${key}.bin`); }

  private async read(key: string, size: number): Promise<FileHandle | null> {
    let file: FileHandle | undefined;
    try {
      file = await open(this.filename(key), "r");
      if ((await file.stat()).size === size) return file;
      await file.close();
      return null;
    } catch (error) {
      await file?.close();
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async get(asset: CacheAsset, fill: (destination: string) => Promise<void>) {
    if (!this.canCache(asset.sizeBytes)) throw new Error("Asset exceeds disk cache limit");
    const key = assetCacheKey(asset);
    const cached = await this.read(key, asset.sizeBytes);
    if (cached) return { file: cached, status: "HIT" as const };
    let pending = this.pending.get(key);
    const status = pending ? "COALESCED" as const : "MISS" as const;
    if (!pending) {
      // Limit distinct fills as well as the origin queue, before creating temporary files.
      if (this.pending.size >= 64) throw new OriginBusyError("Asset cache queue is full");
      pending = this.fill(key, asset.sizeBytes, fill);
      this.pending.set(key, pending);
    }
    try { await pending; }
    finally { if (this.pending.get(key) === pending) this.pending.delete(key); }
    const file = await this.read(key, asset.sizeBytes);
    // Eviction by another request/process is allowed, but never return a partial file.
    if (!file) throw new OriginBusyError("Cached asset was evicted; retry the request");
    return { file, status };
  }

  private async fill(key: string, size: number, write: (destination: string) => Promise<void>) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporary = path.join(this.directory, `${key}.${randomUUID()}.tmp`);
    try {
      await write(temporary);
      if ((await stat(temporary)).size !== size) throw new Error("Asset byte length does not match metadata");
      // Serialize eviction and commit so concurrent fills respect the completed-file budget.
      const commit = this.commit.then(async () => {
        await this.makeRoom(size);
        await rename(temporary, this.filename(key));
      });
      this.commit = commit.catch(() => {});
      await commit;
    } finally {
      await rm(temporary, { force: true });
    }
  }

  private async makeRoom(incoming: number) {
    const files: Array<{ name: string; bytes: number; modified: number }> = [];
    for (const name of await readdir(this.directory)) {
      if (!/^[a-f0-9]{64}(\.bin|\.[a-f0-9-]+\.tmp)$/.test(name)) continue;
      try {
        const info = await stat(path.join(this.directory, name));
        if (name.endsWith(".bin")) files.push({ name, bytes: info.size, modified: info.mtimeMs });
        // Reclaim abandoned partial writes after a process crash, never active downloads.
        else if (info.mtimeMs < Date.now() - 3_600_000) await rm(path.join(this.directory, name), { force: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    let bytes = files.reduce((sum, file) => sum + file.bytes, 0);
    for (const file of files.sort((a, b) => a.modified - b.modified)) {
      if (bytes + incoming <= this.maxBytes) break;
      await rm(path.join(this.directory, file.name), { force: true });
      bytes -= file.bytes;
    }
  }
}
