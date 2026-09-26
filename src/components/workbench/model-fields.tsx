"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Check, ChevronsUpDown, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { ContentField, ContentModel, FieldInput, FieldType } from "@/lib/cms/types";
import { defaultRichTextFeatures, richTextFeaturesFromConfig, withRichTextFeatures, type RichTextFeature, type RichTextFeatureConfig } from "@/lib/rich-text";
import { createFieldAction, deleteFieldAction, moveFieldAction, updateFieldAction } from "./actions";
import { formatJson, parseJsonObject } from "./utils";

const fieldTypes: FieldType[] = ["text", "rich_text", "url", "number", "boolean", "date", "enum", "asset", "component", "slug"];
const fieldTypeLabels: Record<FieldType, string> = {
  text: "Text",
  rich_text: "Rich text",
  url: "URL",
  number: "Number",
  boolean: "Boolean",
  date: "Date",
  enum: "Dropdown",
  asset: "Asset",
  component: "Component",
  slug: "Slug",
};

type EnumOption = {
  label: string;
  value: string;
};

function normalizeFieldKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^[^a-z]+/, "")
    .slice(0, 80);
}

export function FieldEditor({ tenantSlug, models, modelId }: { tenantSlug: string; models: ContentModel[]; modelId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [keyEdited, setKeyEdited] = useState(false);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [required, setRequired] = useState(false);
  const [isTitle, setIsTitle] = useState(false);
  const [targetModelSlugs, setTargetModelSlugs] = useState<string[]>([]);
  const [isList, setIsList] = useState(false);
  const [uniqueSlug, setUniqueSlug] = useState(false);
  const [enumOptions, setEnumOptions] = useState<EnumOption[]>([]);
  const [configJson, setConfigJson] = useState("{}");
  const [richTextFeatures, setRichTextFeatures] = useState<RichTextFeatureConfig>({ ...defaultRichTextFeatures });

  function body(): FieldInput {
    let config = parseJsonObject(configJson);
    if (type === "component") {
      config.targetModelSlugs = targetModelSlugs;
      config.isList = isList;
    }
    if (type === "rich_text") {
      config = withRichTextFeatures(config, richTextFeatures);
    }
    if (type === "slug") {
      config.unique = uniqueSlug;
    }
    if (type === "enum") {
      config.options = serializeEnumOptions(enumOptions);
    }
    return { key, label, type, required, config, isTitle };
  }

  function reset() {
    setKey("");
    setKeyEdited(false);
    setLabel("");
    setType("text");
    setRequired(false);
    setIsTitle(false);
    setTargetModelSlugs([]);
    setIsList(false);
    setUniqueSlug(false);
    setEnumOptions([]);
    setConfigJson("{}");
    setRichTextFeatures({ ...defaultRichTextFeatures });
  }

  function run(action: () => Promise<unknown>, success: string) {
    startTransition(async () => {
      try {
        await action();
        router.refresh();
        toast.success(success);
        setOpen(false);
        reset();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action failed");
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button><Plus data-icon="inline-start" /> Add field</Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto data-[side=right]:w-[calc(100%-1rem)] data-[side=right]:sm:max-w-xl">
        <SheetHeader className="border-b">
          <SheetTitle>Add a field</SheetTitle>
          <SheetDescription>Choose how editors will enter and store this piece of content.</SheetDescription>
        </SheetHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => createFieldAction(tenantSlug, modelId, body()), "Field added");
          }}
        >
          <FieldGroup className="flex-1 px-4 py-2">
            <Field>
              <FieldLabel htmlFor="new-field-label">Label</FieldLabel>
              <Input
                id="new-field-label"
                aria-label="Field label"
                autoFocus
                placeholder="e.g. Page title"
                value={label}
                onChange={(event) => {
                  setLabel(event.target.value);
                  if (!keyEdited) setKey(normalizeFieldKey(event.target.value));
                }}
              />
              <FieldDescription>The name content editors will see.</FieldDescription>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="new-field-key">API key</FieldLabel>
                <Input
                  id="new-field-key"
                  aria-label="API key"
                  autoComplete="off"
                  maxLength={80}
                  placeholder="page_title"
                  spellCheck={false}
                  value={key}
                  onChange={(event) => { setKeyEdited(true); setKey(normalizeFieldKey(event.target.value)); }}
                />
                <FieldDescription>Used in API responses. It cannot be changed later.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>Field type</FieldLabel>
                <Select value={type} onValueChange={(value) => setType(value as FieldType)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup>{fieldTypes.map((item) => <SelectItem key={item} value={item}>{fieldTypeLabels[item]}</SelectItem>)}</SelectGroup></SelectContent>
                </Select>
                <FieldDescription>Controls the input shown to editors.</FieldDescription>
              </Field>
            </div>
            {type === "component" && (
              <div className="grid gap-4 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Allowed component models</FieldLabel>
                  <ModelMultiSelect models={models} value={targetModelSlugs} onChange={setTargetModelSlugs} />
                </Field>
                <Field>
                  <FieldLabel>Linked entries</FieldLabel>
                  <Select value={isList ? "multiple" : "single"} onValueChange={(value) => setIsList(value === "multiple")}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectGroup><SelectItem value="single">Single entry</SelectItem><SelectItem value="multiple">Multiple entries</SelectItem></SelectGroup></SelectContent>
                  </Select>
                </Field>
              </div>
            )}
            {type === "rich_text" && <RichTextFeatureControls value={richTextFeatures} onChange={setRichTextFeatures} />}
            {type === "enum" && <EnumOptionsEditor value={enumOptions} onChange={setEnumOptions} />}
            {type === "slug" && (
              <label className="flex items-center gap-3 rounded-xl border bg-muted/20 p-4 text-sm">
                <Checkbox aria-label="Unique value" checked={uniqueSlug} onCheckedChange={(checked) => setUniqueSlug(checked === true)} />
                <span><span className="block font-medium">Unique value</span><span className="block text-xs text-muted-foreground">Prevent two entries from using the same slug.</span></span>
              </label>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldToggle checked={required} onCheckedChange={setRequired} title="Required field" description="Editors must provide a value before publishing." />
              <FieldToggle checked={isTitle} onCheckedChange={setIsTitle} title="Use as entry title" description="Show this value when identifying entries." />
            </div>
            {type !== "component" ? (
              <AdvancedConfig value={configJson} onChange={setConfigJson} rows={4} />
            ) : null}
          </FieldGroup>
          <SheetFooter className="sticky bottom-0 flex-row justify-end border-t bg-popover">
            <SheetClose asChild><Button type="button" variant="outline">Cancel</Button></SheetClose>
            <Button
              type="submit"
              disabled={isPending || !key || !label.trim() || (type === "component" && !targetModelSlugs.length) || (type === "enum" && !areEnumOptionsValid(enumOptions))}
            >
              <Plus data-icon="inline-start" /> {isPending ? "Adding…" : "Add field"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function FieldTable({ tenantSlug, fields, models, modelId }: { tenantSlug: string; fields: ContentField[]; models: ContentModel[]; modelId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isArchived = models.find((model) => model.id === modelId)?.status === "archived";

  function move(field: ContentField, direction: "up" | "down") {
    startTransition(async () => {
      try {
        await moveFieldAction(tenantSlug, modelId, { fieldId: field.id, direction });
        toast.success(`${field.label} moved ${direction}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not move field");
      }
    });
  }

  function run(action: () => Promise<unknown>, success: string, onSuccess?: () => void) {
    startTransition(async () => {
      try {
        await action();
        router.refresh();
        toast.success(success);
        onSuccess?.();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action failed");
      }
    });
  }

  return (
    <div className="divide-y overflow-hidden rounded-2xl border bg-background/40">
      {fields.length ? fields.map((field, index) => (
        <div key={field.id} data-field-id={field.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 p-4 md:grid-cols-[auto_minmax(0,1fr)_minmax(10rem,0.8fr)_auto]">
          <div className="row-span-3 flex flex-col items-center gap-1 md:row-span-1" role="group" aria-label={`Reorder ${field.label}`}>
            <Button type="button" size="icon-sm" variant="ghost" aria-label={`Move ${field.label} up`} title="Move up" disabled={isPending || isArchived || index === 0} onClick={() => move(field, "up")}>
              <ArrowUp />
            </Button>
            <span className="text-xs tabular-nums text-muted-foreground" aria-label={`Position ${index + 1} of ${fields.length}`}>{index + 1}</span>
            <Button type="button" size="icon-sm" variant="ghost" aria-label={`Move ${field.label} down`} title="Move down" disabled={isPending || isArchived || index === fields.length - 1} onClick={() => move(field, "down")}>
              <ArrowDown />
            </Button>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{field.label}</p>
              <Badge variant="secondary">{fieldTypeLabels[field.type]}</Badge>
            </div>
            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{field.key}</p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {field.required ? <Badge variant="outline">Required</Badge> : null}
            {field.isTitle ? <Badge variant="outline">Entry title</Badge> : null}
            <span className="min-w-0 truncate">{fieldSummary(field)}</span>
          </div>
          <FieldActions tenantSlug={tenantSlug} field={field} models={models} modelId={modelId} isPending={isPending} run={run} />
        </div>
      )) : (
        <div className="px-4 py-10 text-center">
          <p className="font-medium">No fields yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Add a field to define the content editors can enter.</p>
        </div>
      )}
    </div>
  );
}

function FieldActions({ tenantSlug, field, models, modelId, isPending, run }: {
  tenantSlug: string;
  field: ContentField;
  models: ContentModel[];
  modelId: string;
  isPending: boolean;
  run: (action: () => Promise<unknown>, success: string, onSuccess?: () => void) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-2 md:justify-end">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild><Button size="sm" variant="outline"><Pencil data-icon="inline-start" /> Edit</Button></SheetTrigger>
        <SheetContent className="overflow-y-auto data-[side=right]:w-[calc(100%-1rem)] data-[side=right]:sm:max-w-xl">
          <SheetHeader className="border-b">
            <div className="flex items-center gap-2"><Badge variant="secondary">{fieldTypeLabels[field.type]}</Badge><span className="font-mono text-xs text-muted-foreground">{field.key}</span></div>
            <SheetTitle>Edit {field.label}</SheetTitle>
            <SheetDescription>Update how this field appears and behaves for content editors.</SheetDescription>
          </SheetHeader>
          <EditFieldForm tenantSlug={tenantSlug} field={field} models={models} modelId={modelId} isPending={isPending} run={run} onSaved={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={isPending}><Trash2 data-icon="inline-start" /> Delete</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {field.label}?</AlertDialogTitle>
            <AlertDialogDescription>This removes the field from the model. Existing values stored under “{field.key}” will no longer be available in the editor. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => run(() => deleteFieldAction(tenantSlug, modelId, field.id), "Field deleted")}>Delete field</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EditFieldForm({ tenantSlug, field, models, modelId, isPending, run, onSaved }: { tenantSlug: string; field: ContentField; models: ContentModel[]; modelId: string; isPending: boolean; run: (action: () => Promise<unknown>, success: string, onSuccess?: () => void) => void; onSaved: () => void }) {
  const [label, setLabel] = useState(field.label);
  const [config, setConfig] = useState(formatJson(field.type === "enum" ? withoutEnumOptions(field.config) : field.config));
  const [required, setRequired] = useState(field.required);
  const [isTitle, setIsTitle] = useState(field.isTitle);
  const [targetModelSlugs, setTargetModelSlugs] = useState(field.targetModels.map((model) => model.slug));
  const [isList, setIsList] = useState(field.isList);
  const [uniqueSlug, setUniqueSlug] = useState(field.config.unique === true);
  const [enumOptions, setEnumOptions] = useState<EnumOption[]>(enumOptionsFromConfig(field.config));
  const [richTextFeatures, setRichTextFeatures] = useState<RichTextFeatureConfig>(richTextFeaturesFromConfig(field.config));

  return (
    <FieldGroup className="px-4 py-2">
      <Field><FieldLabel htmlFor={`field-${field.id}-label`}>Label</FieldLabel><Input id={`field-${field.id}-label`} aria-label="Field label" value={label} onChange={(event) => setLabel(event.target.value)} /><FieldDescription>The name content editors will see.</FieldDescription></Field>
      {field.type === "component" && (
        <Field>
          <FieldLabel>Allowed component models</FieldLabel>
          <ModelMultiSelect models={models} value={targetModelSlugs} onChange={setTargetModelSlugs} />
        </Field>
      )}
      {field.type === "rich_text" && <RichTextFeatureControls value={richTextFeatures} onChange={setRichTextFeatures} />}
      {field.type === "enum" && <EnumOptionsEditor value={enumOptions} onChange={setEnumOptions} />}
      {field.type === "slug" && <FieldToggle checked={uniqueSlug} onCheckedChange={setUniqueSlug} title="Unique value" description="Prevent two entries from using the same slug." />}
      {field.type === "component" ? <Field><FieldLabel>Linked entries</FieldLabel><Select value={isList ? "multiple" : "single"} onValueChange={(value) => setIsList(value === "multiple")}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="single">Single entry</SelectItem><SelectItem value="multiple">Multiple entries</SelectItem></SelectGroup></SelectContent></Select></Field> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <FieldToggle checked={required} onCheckedChange={setRequired} title="Required field" description="Editors must provide a value before publishing." />
        <FieldToggle checked={isTitle} onCheckedChange={setIsTitle} title="Use as entry title" description="Show this value when identifying entries." />
      </div>
      {field.type !== "component" ? <AdvancedConfig value={config} onChange={setConfig} rows={field.type === "enum" ? 4 : 8} /> : null}
      <div className="sticky bottom-0 -mx-4 mt-2 flex justify-end gap-2 border-t bg-popover px-4 py-4">
        <Button disabled={isPending || !label.trim() || (field.type === "component" && !targetModelSlugs.length) || (field.type === "enum" && !areEnumOptionsValid(enumOptions))} onClick={() => run(async () => {
          let nextConfig = parseJsonObject(config);
          if (field.type === "component") {
            nextConfig.targetModelSlugs = targetModelSlugs;
            nextConfig.isList = isList;
          }
          if (field.type === "rich_text") {
            nextConfig = withRichTextFeatures(nextConfig, richTextFeatures);
          }
          if (field.type === "slug") {
            nextConfig.unique = uniqueSlug;
          }
          if (field.type === "enum") {
            nextConfig.options = serializeEnumOptions(enumOptions);
          }
          await updateFieldAction(tenantSlug, modelId, field.id, { label, required, config: nextConfig, isTitle });
        }, "Field updated", onSaved)}><Save data-icon="inline-start" /> {isPending ? "Saving…" : "Save changes"}</Button>
      </div>
    </FieldGroup>
  );
}

function FieldToggle({ checked, onCheckedChange, title, description }: { checked: boolean; onCheckedChange: (checked: boolean) => void; title: string; description: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-muted/20 p-4 text-sm transition-colors hover:bg-muted/40">
      <Checkbox aria-label={title} className="mt-0.5" checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} />
      <span><span className="block font-medium">{title}</span><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{description}</span></span>
    </label>
  );
}

function AdvancedConfig({ value, onChange, rows }: { value: string; onChange: (value: string) => void; rows: number }) {
  return (
    <details className="rounded-xl border bg-muted/10">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Advanced JSON configuration</summary>
      <div className="border-t p-4">
        <Textarea aria-label="Advanced JSON configuration" className="font-mono text-xs" rows={rows} value={value} onChange={(event) => onChange(event.target.value)} spellCheck={false} />
        <p className="mt-2 text-xs text-muted-foreground">Optional low-level settings for integrations and custom field behavior.</p>
      </div>
    </details>
  );
}

function fieldSummary(field: ContentField): string {
  if (field.type === "component") {
    const targets = field.targetModels.map((model) => model.name).join(", ") || "No models selected";
    return `${targets} · ${field.isList ? "Multiple entries" : "Single entry"}`;
  }
  if (field.type === "enum") {
    const count = enumOptionsFromConfig(field.config).length;
    return `${count} option${count === 1 ? "" : "s"}`;
  }
  if (field.type === "slug" && field.config.unique === true) return "Unique values";
  if (Object.keys(field.config).length > 0) return "Custom settings";
  return "";
}

function EnumOptionsEditor({ className, value, onChange }: { className?: string; value: EnumOption[]; onChange: (value: EnumOption[]) => void }) {
  const duplicateValues = new Set(value.filter((option, index) => option.value.trim() && value.findIndex((item) => item.value.trim() === option.value.trim()) !== index).map((option) => option.value.trim()));

  function updateOption(index: number, key: keyof EnumOption, nextValue: string) {
    onChange(value.map((option, optionIndex) => optionIndex === index ? { ...option, [key]: nextValue } : option));
  }

  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Enum options</p>
          <p className="text-xs text-muted-foreground">Labels are shown to editors; values are stored in entry data.</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...value, { label: "", value: "" }])}>
          <Plus data-icon="inline-start" /> Add option
        </Button>
      </div>
      {value.length ? (
        <div className="grid gap-2">
          {value.map((option, index) => {
            const duplicate = duplicateValues.has(option.value.trim());
            return (
              <div key={index} className="grid gap-2 rounded-xl border bg-muted/20 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                <label className="grid gap-1.5 text-xs font-medium">
                  Label
                  <Input aria-invalid={!option.label.trim()} aria-label={`Option ${index + 1} label`} placeholder="In progress" value={option.label} onChange={(event) => updateOption(index, "label", event.target.value)} />
                </label>
                <label className="grid gap-1.5 text-xs font-medium">
                  Value
                  <Input aria-invalid={!option.value.trim() || duplicate} aria-label={`Option ${index + 1} value`} placeholder="in_progress" value={option.value} onChange={(event) => updateOption(index, "value", event.target.value)} />
                </label>
                <Button type="button" size="icon" variant="ghost" aria-label={`Delete option ${index + 1}`} onClick={() => onChange(value.filter((_, optionIndex) => optionIndex !== index))}>
                  <Trash2 />
                </Button>
                {duplicate ? <p className="text-xs text-destructive sm:col-span-3">Each option needs a unique value.</p> : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">No options yet. Add one to render this field as a dropdown.</div>
      )}
    </div>
  );
}

function enumOptionsFromConfig(config: Record<string, unknown>): EnumOption[] {
  if (!Array.isArray(config.options)) return [];

  return config.options.flatMap((option) => {
    if (typeof option === "string" || typeof option === "number") {
      const value = String(option);
      return [{ label: value, value }];
    }
    if (typeof option === "object" && option !== null && "value" in option) {
      const value = String(option.value ?? "");
      const label = "label" in option ? String(option.label ?? value) : value;
      return [{ label, value }];
    }
    return [];
  });
}

function withoutEnumOptions(config: Record<string, unknown>): Record<string, unknown> {
  const nextConfig = { ...config };
  delete nextConfig.options;
  return nextConfig;
}

function areEnumOptionsValid(options: EnumOption[]): boolean {
  const values = options.map((option) => option.value.trim());
  return options.every((option) => option.label.trim() && option.value.trim()) && new Set(values).size === values.length;
}

function serializeEnumOptions(options: EnumOption[]): EnumOption[] {
  if (!areEnumOptionsValid(options)) throw new Error("Enum options need a label and a unique value");
  return options.map((option) => ({ label: option.label.trim(), value: option.value.trim() }));
}

function ModelMultiSelect({ models, value, onChange }: { models: ContentModel[]; value: string[]; onChange: (value: string[]) => void }) {
  const selected = new Set(value);

  function toggle(slug: string) {
    onChange(selected.has(slug) ? value.filter((item) => item !== slug) : [...value, slug]);
  }

  return (
    <div className="flex flex-col gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="w-full justify-between font-normal">
            {value.length ? `${value.length} model${value.length === 1 ? "" : "s"} selected` : "Select allowed models"}
            <ChevronsUpDown data-icon="inline-end" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
          <Command>
            <CommandInput placeholder="Search models..." />
            <CommandList>
              <CommandEmpty>No models found.</CommandEmpty>
              <CommandGroup heading="Models">
                {models.map((model) => <CommandItem key={model.id} value={`${model.name} ${model.slug}`} onSelect={() => toggle(model.slug)}><Check className={selected.has(model.slug) ? "opacity-100" : "opacity-0"} /><span className="min-w-0 flex-1 truncate">{model.name}</span><span className="font-mono text-xs text-muted-foreground">{model.slug}</span></CommandItem>)}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value.length ? <div className="flex flex-wrap gap-1">{value.map((slug) => { const model = models.find((item) => item.slug === slug); return <Badge key={slug} variant="secondary">{model?.name ?? slug}<button type="button" className="ml-1 rounded-full" onClick={() => toggle(slug)}><X /><span className="sr-only">Remove {model?.name ?? slug}</span></button></Badge>; })}</div> : <p className="text-xs text-muted-foreground">Choose one or more models that editors may link here.</p>}
    </div>
  );
}

function RichTextFeatureControls({ className, value, onChange }: { className?: string; value: RichTextFeatureConfig; onChange: (value: RichTextFeatureConfig) => void }) {
  function updateFeature(feature: RichTextFeature, checked: boolean) {
    onChange({ ...value, [feature]: checked });
  }

  return (
    <div className={className}>
      <p className="mb-2 text-sm font-medium">Rich text options</p>
      <div className="grid gap-2 rounded-xl border bg-muted/30 p-3 sm:grid-cols-2">
        {richTextFeatureOptions.map((option) => (
          <label key={option.key} className="flex items-center gap-2 text-sm">
            <Checkbox checked={value[option.key]} onCheckedChange={(checked) => updateFeature(option.key, checked === true)} /> {option.label}
          </label>
        ))}
      </div>
    </div>
  );
}

const richTextFeatureOptions: Array<{ key: RichTextFeature; label: string }> = [
  { key: "headings", label: "Headings" },
  { key: "lists", label: "Lists" },
  { key: "links", label: "Links" },
  { key: "media", label: "Asset media" },
  { key: "code", label: "Code" },
  { key: "quotes", label: "Quotes and dividers" },
];
