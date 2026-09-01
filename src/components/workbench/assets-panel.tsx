"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, FileIcon, ImageIcon, Save, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { AssetSort, AssetWithPreview } from "@/lib/cms/types";
import { completeUploadAction, deleteAssetAction, presignUploadAction, updateAssetAction } from "./actions";

export function AssetsPanel({
  tenantSlug,
  assets,
  query,
  sort,
  page,
  pageSize,
  total,
}: {
  tenantSlug: string;
  assets: AssetWithPreview[];
  query: string;
  sort: AssetSort;
  page: number;
  pageSize: number;
  total: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const appPath = `/app/${tenantSlug}`;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const firstResult = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastResult = Math.min(page * pageSize, total);

  function run(action: () => Promise<void>, success: string) {
    startTransition(async () => {
      try {
        await action();
        router.refresh();
        toast.success(success);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action failed");
      }
    });
  }

  return (
    <div id="assets">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><ImageIcon /> Assets</CardTitle>
              <CardDescription>Browse tenant-scoped assets, preview images, and delete files from storage.</CardDescription>
            </div>
            <Button asChild>
              <Link href={`${appPath}/assets/new`}><Upload data-icon="inline-start" /> Upload asset</Link>
            </Button>
          </div>
        </CardHeader>
        <form action={`${appPath}/assets`} method="get" className="flex flex-col gap-3 border-b px-4 pb-4 md:flex-row md:items-end">
            <Field className="md:flex-1">
              <FieldLabel htmlFor="asset-search">Search assets</FieldLabel>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="asset-search"
                  name="q"
                  defaultValue={query}
                  placeholder="Search by name, type, key, or status"
                  className="pl-8"
                />
              </div>
              <FieldDescription>{total ? `Showing ${firstResult}-${lastResult} of ${total} assets.` : "No assets found."}</FieldDescription>
            </Field>
            <Field className="md:w-64">
              <FieldLabel>Order by</FieldLabel>
              <Select value={sort} onValueChange={(value) => router.push(buildAssetsHref(appPath, query, value as AssetSort, 1))}>
                <SelectTrigger>
                  <SelectValue placeholder="Order assets" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="date-desc">Newest first</SelectItem>
                    <SelectItem value="date-asc">Oldest first</SelectItem>
                    <SelectItem value="name-asc">Name A-Z</SelectItem>
                    <SelectItem value="name-desc">Name Z-A</SelectItem>
                    <SelectItem value="type-asc">Type A-Z</SelectItem>
                    <SelectItem value="size-desc">Largest first</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <input type="hidden" name="sort" value={sort} />
            <Button type="submit" variant="outline"><Search data-icon="inline-start" /> Search</Button>
        </form>
        <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {assets.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground sm:col-span-2 xl:col-span-3 2xl:col-span-4">
              {query.trim() ? "No assets match your search." : "No assets uploaded yet."}
            </div>
          ) : (
            assets.map((asset) => (
              <Card key={asset.id} className="overflow-hidden">
                <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                  {isPreviewableImage(asset) ? (
                    <Image
                      src={asset.previewUrl!}
                      alt={asset.originalName}
                      fill
                      unoptimized
                      sizes="(min-width: 1536px) 20vw, (min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
                      {asset.mimeType.startsWith("image/") ? <ImageIcon /> : <FileIcon />}
                      <span className="text-xs font-medium uppercase tracking-[0.22em]">{asset.mimeType.split("/")[1] ?? "file"}</span>
                    </div>
                  )}
                </div>
                <CardHeader className="gap-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">{asset.originalName}</CardTitle>
                      <CardDescription className="truncate font-mono text-xs">{asset.objectKey}</CardDescription>
                    </div>
                    <Badge variant="secondary">{asset.status}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{asset.mimeType}</Badge>
                    <Badge variant="outline">{formatBytes(asset.sizeBytes)}</Badge>
                    {asset.imageWidth && asset.imageHeight ? <Badge variant="outline">{asset.imageWidth} x {asset.imageHeight}</Badge> : null}
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`${appPath}/assets/${asset.id}`}>View details</Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={isPending}
                      onClick={() => run(async () => { await deleteAssetAction(tenantSlug, asset.id); }, "Asset deleted")}
                    >
                      <Trash2 data-icon="inline-start" /> Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </CardContent>
        {totalPages > 1 ? (
          <CardContent className="flex items-center justify-between gap-3 border-t pt-4">
            <Button asChild={page > 1} variant="outline" disabled={page <= 1}>
              {page > 1 ? <Link href={buildAssetsHref(appPath, query, sort, page - 1)}><ChevronLeft data-icon="inline-start" /> Previous</Link> : <span><ChevronLeft data-icon="inline-start" /> Previous</span>}
            </Button>
            <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
            <Button asChild={page < totalPages} variant="outline" disabled={page >= totalPages}>
              {page < totalPages ? <Link href={buildAssetsHref(appPath, query, sort, page + 1)}>Next <ChevronRight data-icon="inline-end" /></Link> : <span>Next <ChevronRight data-icon="inline-end" /></span>}
            </Button>
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}

function isPreviewableImage(asset: AssetWithPreview): boolean {
  return asset.status === "ready" && asset.mimeType.startsWith("image/") && Boolean(asset.previewUrl);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function buildAssetsHref(appPath: string, query: string, sort: AssetSort, page: number): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (sort !== "date-desc") params.set("sort", sort);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return `${appPath}/assets${search ? `?${search}` : ""}`;
}

export function AssetDetailPanel({ tenantSlug, asset }: { tenantSlug: string; asset: AssetWithPreview }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [originalName, setOriginalName] = useState(asset.originalName);
  const appPath = `/app/${tenantSlug}`;

  function run(action: () => Promise<void>, success: string) {
    startTransition(async () => {
      try {
        await action();
        router.refresh();
        toast.success(success);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action failed");
      }
    });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
                <Link href={`${appPath}/assets`}><ArrowLeft data-icon="inline-start" /> Back to assets</Link>
              </Button>
              <CardTitle className="truncate text-2xl">{asset.originalName}</CardTitle>
              <CardDescription className="truncate font-mono text-xs">{asset.objectKey}</CardDescription>
            </div>
            <Badge variant="secondary">{asset.status}</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="relative min-h-[340px] overflow-hidden rounded-xl bg-muted md:min-h-[520px]">
            {isPreviewableImage(asset) ? (
              <Image src={asset.previewUrl!} alt={asset.originalName} fill unoptimized sizes="(min-width: 1280px) 65vw, 100vw" className="object-contain" />
            ) : (
              <div className="flex h-full min-h-[340px] flex-col items-center justify-center gap-3 text-muted-foreground md:min-h-[520px]">
                {asset.mimeType.startsWith("image/") ? <ImageIcon /> : <FileIcon />}
                <span className="text-xs font-medium uppercase tracking-[0.22em]">{asset.mimeType}</span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {asset.downloadUrl && asset.status === "ready" ? (
              <Button asChild>
                <a href={asset.downloadUrl} download={asset.originalName}>
                  <Download data-icon="inline-start" /> Download
                </a>
              </Button>
            ) : (
              <Button disabled><Download data-icon="inline-start" /> Download</Button>
            )}
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() => run(async () => { await deleteAssetAction(tenantSlug, asset.id); router.push(`${appPath}/assets`); }, "Asset deleted")}
            >
              <Trash2 data-icon="inline-start" /> Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Edit details</CardTitle>
            <CardDescription>Update the display filename used throughout entries and asset pickers.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="asset-original-name">Filename</FieldLabel>
                <Input id="asset-original-name" value={originalName} onChange={(event) => setOriginalName(event.target.value)} />
                <FieldDescription>The storage key, MIME type, size, and dimensions are preserved.</FieldDescription>
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button disabled={isPending || !originalName.trim() || originalName === asset.originalName} onClick={() => run(async () => { await updateAssetAction(tenantSlug, asset.id, { originalName }); }, "Asset updated")}>
                  <Save data-icon="inline-start" /> Save changes
                </Button>
              </div>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Asset metadata</CardTitle>
            <CardDescription>Immutable upload and storage details.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <MetadataRow label="MIME type" value={asset.mimeType} />
            <MetadataRow label="Size" value={formatBytes(asset.sizeBytes)} />
            <MetadataRow label="Dimensions" value={asset.imageWidth && asset.imageHeight ? `${asset.imageWidth} x ${asset.imageHeight}` : "Not available"} />
            <Separator />
            <MetadataRow label="Asset ID" value={asset.id} mono />
            <MetadataRow label="Bucket" value={asset.bucket} mono />
            <MetadataRow label="Object key" value={asset.objectKey} mono />
            <MetadataRow label="ETag" value={asset.etag ?? "Not available"} mono />
            <Separator />
            <MetadataRow label="Created" value={formatDate(asset.createdAt)} />
            <MetadataRow label="Updated" value={formatDate(asset.updatedAt)} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetadataRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid gap-1">
      <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <span className={mono ? "break-all font-mono text-xs" : "break-words"}>{value}</span>
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function AssetCreatePanel({ tenantSlug }: { tenantSlug: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const appPath = `/app/${tenantSlug}`;

  function run(action: () => Promise<void>, success: string) {
    startTransition(async () => {
      try {
        await action();
        toast.success(success);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action failed");
      }
    });
  }

  async function uploadFile() {
    if (!file) return;
    const presigned = await presignUploadAction(tenantSlug, { filename: file.name, mimeType: file.type, fileSize: file.size });
    const formData = new FormData();
    for (const [key, value] of Object.entries(presigned.upload.fields)) {
      formData.append(key, value);
    }
    formData.append("file", file);
    const response = await fetch(presigned.upload.url, { method: "POST", body: formData });
    if (!response.ok) throw new Error("S3 upload failed");
    await completeUploadAction(tenantSlug, { uploadToken: presigned.uploadToken });
    setFile(null);
    router.push(`${appPath}/assets`);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Upload /> Upload asset</CardTitle>
        <CardDescription>Uses presign, direct S3 POST, then upload completion.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Input type="file" accept="image/*,application/pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        <div className="flex flex-wrap gap-2">
          <Button disabled={isPending || !file} onClick={() => run(uploadFile, "Asset uploaded")}><Upload data-icon="inline-start" /> Upload</Button>
          <Button asChild variant="outline">
            <Link href={`${appPath}/assets`}>Cancel</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
