"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowDown, ArrowUp, FileIcon, ImageIcon, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { AssetWithPreview, ContentEntry, ContentField } from "@/lib/cms/types";
import type { ComponentReferenceList } from "./types";
import { RichTextEditor } from "./rich-text-editor";
import { entryTitle, getEnumOptions, numberInputValue, stringValue } from "./utils";

type EntryFormProps = {
  fields: ContentField[];
  assets: AssetWithPreview[];
  componentReferences: ComponentReferenceList[];
  data: Record<string, unknown>;
  mode: "create" | "edit";
  onChange: (data: Record<string, unknown>) => void;
};

export function EntryForm({ fields, assets, componentReferences, data, mode, onChange }: EntryFormProps) {
  if (!fields.length) {
    return (
      <div className="rounded-2xl border bg-muted/30 p-4 text-sm text-muted-foreground">
        This model has no fields yet. Add fields to the model before building structured entries.
      </div>
    );
  }

  function updateField(key: string, value: unknown) {
    onChange({ ...data, [key]: value });
  }

  return (
    <div className="rounded-2xl border p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{mode === "create" ? "Create from model" : "Edit from model"}</p>
        <Badge variant="secondary">{fields.length} fields</Badge>
      </div>
      <FieldGroup>
        {fields.map((field) => (
          <EntryFieldInput key={field.id} field={field} assets={assets} componentReferences={componentReferences} value={data[field.key]} onChange={(value) => updateField(field.key, value)} />
        ))}
      </FieldGroup>
    </div>
  );
}

function EntryFieldInput({ field, assets, componentReferences, value, onChange }: { field: ContentField; assets: AssetWithPreview[]; componentReferences: ComponentReferenceList[]; value: unknown; onChange: (value: unknown) => void }) {
  const fieldId = `entry-field-${field.id}`;

  if (field.type === "boolean") {
    return (
      <Field orientation="horizontal">
        <Checkbox id={fieldId} checked={value === true} onCheckedChange={(checked) => onChange(checked === true)} />
        <div>
          <FieldLabel htmlFor={fieldId}>{field.label}{field.required ? " *" : ""}</FieldLabel>
          <FieldDescription>{field.key}</FieldDescription>
        </div>
      </Field>
    );
  }

  if (field.type === "rich_text") {
    return (
      <Field>
        <FieldLabel htmlFor={fieldId}>{field.label}{field.required ? " *" : ""}</FieldLabel>
        <RichTextEditor id={fieldId} value={value} config={field.config} assets={assets} onChange={onChange} />
        <FieldDescription>{field.key}</FieldDescription>
      </Field>
    );
  }

  if (field.type === "number") {
    return (
      <Field>
        <FieldLabel htmlFor={fieldId}>{field.label}{field.required ? " *" : ""}</FieldLabel>
        <Input id={fieldId} type="number" value={numberInputValue(value)} onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))} />
        <FieldDescription>{field.key}</FieldDescription>
      </Field>
    );
  }

  if (field.type === "date" || field.type === "time") {
    return (
      <Field>
        <FieldLabel htmlFor={fieldId}>{field.label}{field.required ? " *" : ""}</FieldLabel>
        <Input id={fieldId} type={field.type} step={field.type === "time" ? 60 : undefined} value={stringValue(value)} onChange={(event) => onChange(event.target.value)} />
        <FieldDescription>{field.key}{field.type === "time" ? ". Local time, in hours and minutes." : ""}</FieldDescription>
      </Field>
    );
  }

  if (field.type === "url") {
    return (
      <Field>
        <FieldLabel htmlFor={fieldId}>{field.label}{field.required ? " *" : ""}</FieldLabel>
        <Input id={fieldId} type="url" inputMode="url" placeholder="https://example.com" value={stringValue(value)} onChange={(event) => onChange(event.target.value)} />
        <FieldDescription>{field.key}. Enter a complete URL, including the protocol.</FieldDescription>
      </Field>
    );
  }

  if (field.type === "slug") {
    return (
      <Field>
        <FieldLabel htmlFor={fieldId}>{field.label}{field.required ? " *" : ""}</FieldLabel>
        <Input id={fieldId} value={stringValue(value)} pattern="[a-z0-9_-]+" placeholder="my-page_slug" onChange={(event) => onChange(normalizeSlugInput(event.target.value))} />
        <FieldDescription>{field.key}. Use lowercase letters, numbers, hyphens, and underscores{field.config.unique === true ? "; must be unique" : ""}.</FieldDescription>
      </Field>
    );
  }

  if (field.type === "enum") return <EnumFieldInput field={field} value={value} onChange={onChange} />;
  if (field.type === "asset") return <AssetFieldInput field={field} assets={assets} value={value} onChange={onChange} />;
  if (field.type === "component") return <ComponentFieldInput field={field} referenceLists={componentReferences.filter((referenceList) => referenceList.fieldId === field.id)} value={value} onChange={onChange} />;

  return (
    <Field>
      <FieldLabel htmlFor={fieldId}>{field.label}{field.required ? " *" : ""}</FieldLabel>
      <Input id={fieldId} value={stringValue(value)} onChange={(event) => onChange(event.target.value)} />
      <FieldDescription>{field.key}</FieldDescription>
    </Field>
  );
}

function EnumFieldInput({ field, value, onChange }: { field: ContentField; value: unknown; onChange: (value: unknown) => void }) {
  const options = getEnumOptions(field);

  if (!options.length) {
    return (
      <Field>
        <FieldLabel>{field.label}{field.required ? " *" : ""}</FieldLabel>
        <Input value={stringValue(value)} onChange={(event) => onChange(event.target.value)} />
        <FieldDescription>{field.key}. Add config.options to render a dropdown.</FieldDescription>
      </Field>
    );
  }

  return (
    <Field>
      <FieldLabel>{field.label}{field.required ? " *" : ""}</FieldLabel>
      <Select value={stringValue(value) || undefined} onValueChange={onChange}>
        <SelectTrigger className="w-full"><SelectValue placeholder="Select an option" /></SelectTrigger>
        <SelectContent><SelectGroup>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent>
      </Select>
      <FieldDescription>{field.key}</FieldDescription>
    </Field>
  );
}

function AssetFieldInput({ field, assets, value, onChange }: { field: ContentField; assets: AssetWithPreview[]; value: unknown; onChange: (value: unknown) => void }) {
  const [open, setOpen] = useState(false);
  const readyAssets = assets.filter((asset) => asset.status === "ready");
  const assetId = stringValue(value);
  const selectedAsset = assetId ? assets.find((asset) => asset.id === assetId) ?? null : null;

  function selectAsset(nextAssetId: string) {
    onChange(nextAssetId);
    setOpen(false);
  }

  return (
    <Field>
      <FieldLabel>{field.label}{field.required ? " *" : ""}</FieldLabel>
      {!assetId ? <Input value={assetId} onChange={(event) => onChange(event.target.value)} placeholder="Asset id" /> : null}
      {assetId ? <SelectedAssetCard assetId={assetId} asset={selectedAsset} onChange={() => setOpen(true)} onRemove={() => onChange(null)} /> : null}
      {!assetId ? (
        <Button type="button" variant="outline" className="w-fit" disabled={!readyAssets.length} onClick={() => setOpen(true)}>
          <Plus data-icon="inline-start" /> Select asset
        </Button>
      ) : null}
      <AssetPickerDialog open={open} onOpenChange={setOpen} assets={readyAssets} selectedAssetId={assetId} onSelect={selectAsset} />
      <FieldDescription>{field.key}. Entry stores the selected asset id.</FieldDescription>
    </Field>
  );
}

function SelectedAssetCard({ assetId, asset, onChange, onRemove }: { assetId: string; asset: AssetWithPreview | null; onChange: () => void; onRemove: () => void }) {
  if (!asset) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-3 text-sm">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground">
            <FileIcon />
          </div>
          <div className="min-w-0">
            <p className="font-medium">Asset not found</p>
            <p className="truncate font-mono text-xs text-muted-foreground">{assetId}</p>
            <p className="text-xs text-muted-foreground">This id is not in the current tenant asset list.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onChange}>Change</Button>
          <Button type="button" size="sm" variant="ghost" onClick={onRemove}>Remove</Button>
        </div>
      </div>
    );
  }

  const previewable = isPreviewableImage(asset);
  const mimeHint = asset.mimeType.split("/")[1] ?? asset.mimeType;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-3 text-sm">
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-background text-muted-foreground">
          {previewable ? (
            <Image src={asset.previewUrl!} alt={asset.originalName} fill unoptimized sizes="64px" className="object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-1 px-1 text-center">
              {asset.mimeType.startsWith("image/") ? <ImageIcon /> : <FileIcon />}
              <span className="max-w-full truncate text-[0.625rem] font-medium uppercase tracking-[0.16em]">{mimeHint}</span>
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium">{asset.originalName}</p>
            <Badge variant="secondary">{asset.status}</Badge>
          </div>
          <p className="truncate font-mono text-xs text-muted-foreground">{asset.id}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="outline">{asset.mimeType}</Badge>
            <Badge variant="outline">{formatBytes(asset.sizeBytes)}</Badge>
            {asset.imageWidth && asset.imageHeight ? <Badge variant="outline">{asset.imageWidth} x {asset.imageHeight}</Badge> : null}
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onChange}>Change</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onRemove}>Remove</Button>
      </div>
    </div>
  );
}

function AssetPickerDialog({ open, onOpenChange, assets, selectedAssetId, onSelect }: { open: boolean; onOpenChange: (open: boolean) => void; assets: AssetWithPreview[]; selectedAssetId: string; onSelect: (assetId: string) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 sm:max-w-2xl">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle>Select asset</DialogTitle>
          <DialogDescription>Choose a ready asset from this tenant.</DialogDescription>
        </DialogHeader>
        <Separator />
        <Command className="rounded-none">
          <CommandInput placeholder="Search assets..." />
          <CommandList className="max-h-[28rem]">
            <CommandEmpty>No assets found.</CommandEmpty>
            <CommandGroup heading="Assets">
              {assets.map((asset) => (
                <CommandItem key={asset.id} value={`${asset.originalName} ${asset.mimeType} ${asset.id}`} onSelect={() => onSelect(asset.id)}>
                  <AssetPickerItem asset={asset} selected={asset.id === selectedAssetId} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function AssetPickerItem({ asset, selected }: { asset: AssetWithPreview; selected: boolean }) {
  const previewable = isPreviewableImage(asset);
  const mimeHint = asset.mimeType.split("/")[1] ?? asset.mimeType;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
        {previewable ? (
          <Image src={asset.previewUrl!} alt={asset.originalName} fill unoptimized sizes="48px" className="object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1 px-1 text-center">
            {asset.mimeType.startsWith("image/") ? <ImageIcon /> : <FileIcon />}
            <span className="max-w-full truncate text-[0.55rem] font-medium uppercase tracking-[0.14em]">{mimeHint}</span>
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium">{asset.originalName}</p>
          {selected ? <Badge variant="secondary">selected</Badge> : null}
        </div>
        <p className="truncate font-mono text-xs text-muted-foreground">{asset.id}</p>
        <p className="truncate text-xs text-muted-foreground">{asset.mimeType} | {formatBytes(asset.sizeBytes)}</p>
      </div>
    </div>
  );
}

function ComponentFieldInput({ field, referenceLists, value, onChange }: { field: ContentField; referenceLists: ComponentReferenceList[]; value: unknown; onChange: (value: unknown) => void }) {
  const [open, setOpen] = useState(false);
  const selectedIds = componentReferenceIds(field, value);
  const selectedSet = new Set(selectedIds);
  const entryData = new Map(referenceLists.flatMap((referenceList) => referenceList.entries.map((entry) => [entry.id, { entry, referenceList }] as const)));

  function updateSelectedIds(ids: string[]) {
    onChange(field.isList ? ids.map(componentReferenceValue) : ids[0] ? componentReferenceValue(ids[0]) : null);
  }

  function selectEntry(entryId: string) {
    if (field.isList) {
      if (!selectedSet.has(entryId)) updateSelectedIds([...selectedIds, entryId]);
      return;
    }

    updateSelectedIds([entryId]);
    setOpen(false);
  }

  function removeEntry(entryId: string) {
    updateSelectedIds(selectedIds.filter((id) => id !== entryId));
  }

  function moveEntry(entryId: string, direction: -1 | 1) {
    const index = selectedIds.indexOf(entryId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= selectedIds.length) return;

    const nextIds = [...selectedIds];
    const [item] = nextIds.splice(index, 1);
    if (!item) return;
    nextIds.splice(nextIndex, 0, item);
    updateSelectedIds(nextIds);
  }

  return (
    <Field>
      <FieldLabel>{field.label}{field.required ? " *" : ""}</FieldLabel>
      <div className="rounded-xl border bg-muted/30 p-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">component</Badge>
            <Badge variant="outline">{field.isList ? "list" : "single"}</Badge>
          </div>
          <Button size="sm" variant="outline" disabled={!referenceLists.length} onClick={() => setOpen(true)}>
            <Plus data-icon="inline-start" /> {field.isList ? "Add entries" : selectedIds.length ? "Change entry" : "Select entry"}
          </Button>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {selectedIds.map((entryId, index) => {
            const selectedEntry = entryData.get(entryId);
            return (
            <SelectedComponentEntry
              key={entryId}
              entryId={entryId}
              entry={selectedEntry?.entry ?? null}
              modelName={selectedEntry?.referenceList.modelName ?? "Unknown model"}
              titleField={selectedEntry?.referenceList.titleField ?? null}
              canMove={field.isList}
              canMoveUp={index > 0}
              canMoveDown={index < selectedIds.length - 1}
              onMoveUp={() => moveEntry(entryId, -1)}
              onMoveDown={() => moveEntry(entryId, 1)}
              onRemove={() => removeEntry(entryId)}
            />
          ); })}
          {!selectedIds.length && <p className="rounded-lg border bg-background p-3 text-muted-foreground">No entries selected.</p>}
        </div>
      </div>
      <ComponentEntryDialog open={open} onOpenChange={setOpen} field={field} referenceLists={referenceLists} selectedSet={selectedSet} onSelect={selectEntry} />
      <FieldDescription>{field.key}. Select {field.isList ? "one or more reusable entries" : "a reusable entry"} from {field.targetModels.length === 1 ? field.targetModels[0]?.name : `${field.targetModels.length} allowed models`}.</FieldDescription>
    </Field>
  );
}

function SelectedComponentEntry({ entryId, entry, modelName, titleField, canMove, canMoveUp, canMoveDown, onMoveUp, onMoveDown, onRemove }: { entryId: string; entry: ContentEntry | null; modelName: string; titleField: ContentField | null; canMove: boolean; canMoveUp: boolean; canMoveDown: boolean; onMoveUp: () => void; onMoveDown: () => void; onRemove: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background p-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><p className="truncate font-medium">{entry ? entryTitle(entry, titleField) : entryId}</p><Badge variant="outline">{modelName}</Badge></div>
        <p className="truncate font-mono text-xs text-muted-foreground">{entryId}</p>
      </div>
      <div className="flex gap-1">
        {canMove && <Button size="icon-sm" variant="ghost" disabled={!canMoveUp} onClick={onMoveUp}><ArrowUp /><span className="sr-only">Move up</span></Button>}
        {canMove && <Button size="icon-sm" variant="ghost" disabled={!canMoveDown} onClick={onMoveDown}><ArrowDown /><span className="sr-only">Move down</span></Button>}
        <Button size="icon-sm" variant="ghost" onClick={onRemove}><Trash2 /><span className="sr-only">Remove</span></Button>
      </div>
    </div>
  );
}

function ComponentEntryDialog({ open, onOpenChange, field, referenceLists, selectedSet, onSelect }: { open: boolean; onOpenChange: (open: boolean) => void; field: ContentField; referenceLists: ComponentReferenceList[]; selectedSet: Set<string>; onSelect: (entryId: string) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 sm:max-w-lg">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle>Select {field.label}</DialogTitle>
          <DialogDescription>Search and select entries from any allowed component model.</DialogDescription>
        </DialogHeader>
        <Separator />
        <Command className="rounded-none">
          <CommandInput placeholder="Search entries..." />
          <CommandList className="max-h-96">
            <CommandEmpty>No entries found.</CommandEmpty>
            {referenceLists.map((referenceList) => (
            <CommandGroup key={referenceList.modelId} heading={referenceList.modelName}>
              {referenceList.entries.map((entry) => {
                const title = entryTitle(entry, referenceList.titleField);
                return (
                  <CommandItem key={entry.id} value={`${referenceList.modelName} ${title} ${entry.id}`} data-checked={selectedSet.has(entry.id)} onSelect={() => onSelect(entry.id)}>
                    <div className="min-w-0">
                      <p className="truncate">{title}</p>
                      <p className="truncate font-mono text-xs text-muted-foreground">{entry.id}</p>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function componentReferenceIds(field: ContentField, value: unknown): string[] {
  if (field.isList) {
    if (!Array.isArray(value)) return [];
    return value.map(componentReferenceId).filter((entryId): entryId is string => Boolean(entryId));
  }

  const entryId = componentReferenceId(value);
  return entryId ? [entryId] : [];
}

function componentReferenceId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value !== "object" || value === null || !("childEntryId" in value)) return null;

  const entryId = value.childEntryId;
  return typeof entryId === "string" && entryId ? entryId : null;
}

function componentReferenceValue(childEntryId: string) {
  return { childEntryId };
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

function normalizeSlugInput(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

export function AdvancedJsonEditor({ value, onChange, onApply }: { value: string; onChange: (value: string) => void; onApply: () => void }) {
  return (
    <details className="rounded-2xl border p-4">
      <summary className="cursor-pointer list-none text-sm font-medium [&::-webkit-details-marker]:hidden">
        Advanced JSON
      </summary>
      <div className="mt-4">
        <Field>
          <Textarea rows={6} value={value} onChange={(event) => onChange(event.target.value)} />
          <FieldDescription>Use this escape hatch for custom keys or unsupported field configuration.</FieldDescription>
        </Field>
        <Button className="mt-3" variant="outline" onClick={() => {
          try {
            onApply();
            toast.success("JSON applied");
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Invalid JSON");
          }
        }}>
          Apply JSON to form
        </Button>
      </div>
    </details>
  );
}
