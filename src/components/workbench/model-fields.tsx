"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { ContentField, ContentModel, FieldInput, FieldType } from "@/lib/cms/types";
import { defaultRichTextFeatures, richTextFeaturesFromConfig, withRichTextFeatures, type RichTextFeature, type RichTextFeatureConfig } from "@/lib/rich-text";
import { createFieldAction, deleteFieldAction, updateFieldAction } from "./actions";
import { formatJson, parseJsonObject } from "./utils";

const fieldTypes: FieldType[] = ["text", "rich_text", "number", "boolean", "date", "enum", "asset", "component", "slug"];

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
  const [key, setKey] = useState("");
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
    <div className="rounded-2xl border p-4">
      <p className="mb-4 text-sm font-medium">Add field</p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Input aria-label="Field key" autoComplete="off" maxLength={80} placeholder="field_key" spellCheck={false} value={key} onChange={(event) => setKey(normalizeFieldKey(event.target.value))} />
        <Input placeholder="Label" value={label} onChange={(event) => setLabel(event.target.value)} />
        <Select value={type} onValueChange={(value) => setType(value as FieldType)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>{fieldTypes.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
        <label className="flex items-center gap-2 rounded-lg border px-3 text-sm">
          <Checkbox checked={required} onCheckedChange={(checked) => setRequired(checked === true)} /> Required
        </label>
        <label className="flex items-center gap-2 rounded-lg border px-3 text-sm">
          <Checkbox checked={isTitle} onCheckedChange={(checked) => setIsTitle(checked === true)} /> Entry title
        </label>
      </div>
      {type === "component" && (
        <div className="mt-3 grid gap-3 rounded-xl border bg-muted/20 p-3 md:grid-cols-[minmax(0,1fr)_14rem]">
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
      {type === "rich_text" && <RichTextFeatureControls className="mt-3" value={richTextFeatures} onChange={setRichTextFeatures} />}
      {type === "enum" && <EnumOptionsEditor className="mt-3" value={enumOptions} onChange={setEnumOptions} />}
      {type === "slug" && (
        <label className="mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <Checkbox checked={uniqueSlug} onCheckedChange={(checked) => setUniqueSlug(checked === true)} /> Unique slug
        </label>
      )}
      {type !== "component" ? <Textarea className="mt-3" rows={4} value={configJson} onChange={(event) => setConfigJson(event.target.value)} placeholder={type === "enum" ? "Additional config JSON (optional)" : "config JSON"} /> : null}
      <Button
        className="mt-3"
        disabled={isPending || !key || !label || (type === "component" && !targetModelSlugs.length) || (type === "enum" && !areEnumOptionsValid(enumOptions))}
        onClick={() => run(async () => { await createFieldAction(tenantSlug, modelId, body()); setKey(""); setLabel(""); setIsTitle(false); setUniqueSlug(false); setEnumOptions([]); setConfigJson("{}"); setRichTextFeatures({ ...defaultRichTextFeatures }); }, "Field added")}
      >
        <Plus data-icon="inline-start" /> Add field
      </Button>
    </div>
  );
}

export function FieldTable({ tenantSlug, fields, models, modelId }: { tenantSlug: string; fields: ContentField[]; models: ContentModel[]; modelId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

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
    <div className="rounded-2xl border">
      <Table>
        <TableHeader>
          <TableRow><TableHead>Field</TableHead><TableHead>Type</TableHead><TableHead>Config</TableHead><TableHead className="text-right">Actions</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {fields.map((field) => (
            <TableRow key={field.id}>
              <TableCell>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{field.label}</p>
                  {field.isTitle && <Badge variant="outline">title</Badge>}
                </div>
                <p className="font-mono text-xs text-muted-foreground">{field.key}</p>
              </TableCell>
              <TableCell><Badge variant="secondary">{field.type}{field.required ? " required" : ""}</Badge></TableCell>
              <TableCell className="max-w-[24rem]">
                {field.type === "component" ? <div className="flex flex-wrap gap-1">{field.targetModels.map((model) => <Badge key={model.id} variant="outline">{model.name}</Badge>)}<Badge variant="secondary">{field.isList ? "multiple entries" : "single entry"}</Badge></div> : <span className="block truncate font-mono text-xs">{formatJson(field.config)}</span>}
              </TableCell>
              <TableCell className="text-right">
                <Sheet>
                  <SheetTrigger asChild><Button size="sm" variant="outline"><Pencil data-icon="inline-start" /> Edit</Button></SheetTrigger>
                  <SheetContent className="overflow-y-auto sm:max-w-lg">
                    <SheetHeader><SheetTitle>Edit field</SheetTitle><SheetDescription>Patch field metadata and configuration.</SheetDescription></SheetHeader>
                    <EditFieldForm tenantSlug={tenantSlug} field={field} models={models} modelId={modelId} isPending={isPending} run={run} />
                  </SheetContent>
                </Sheet>{" "}
                <Button size="sm" variant="destructive" disabled={isPending} onClick={() => run(async () => { await deleteFieldAction(tenantSlug, modelId, field.id); }, "Field deleted")}>
                  <Trash2 data-icon="inline-start" /> Delete
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function EditFieldForm({ tenantSlug, field, models, modelId, isPending, run }: { tenantSlug: string; field: ContentField; models: ContentModel[]; modelId: string; isPending: boolean; run: (action: () => Promise<void>, success: string) => void }) {
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
    <FieldGroup className="mt-6">
      <Field><FieldLabel>Label</FieldLabel><Input value={label} onChange={(event) => setLabel(event.target.value)} /></Field>
      {field.type === "component" && (
        <Field>
          <FieldLabel>Allowed component models</FieldLabel>
          <ModelMultiSelect models={models} value={targetModelSlugs} onChange={setTargetModelSlugs} />
        </Field>
      )}
      {field.type === "rich_text" && <RichTextFeatureControls value={richTextFeatures} onChange={setRichTextFeatures} />}
      {field.type === "enum" && <EnumOptionsEditor value={enumOptions} onChange={setEnumOptions} />}
      {field.type === "slug" && <label className="flex items-center gap-2 text-sm"><Checkbox checked={uniqueSlug} onCheckedChange={(checked) => setUniqueSlug(checked === true)} /> Unique slug</label>}
      {field.type !== "component" ? <Field><FieldLabel>{field.type === "enum" ? "Additional config JSON" : "Config JSON"}</FieldLabel><Textarea rows={field.type === "enum" ? 4 : 8} value={config} onChange={(event) => setConfig(event.target.value)} /></Field> : null}
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={required} onCheckedChange={(checked) => setRequired(checked === true)} /> Required</label>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={isTitle} onCheckedChange={(checked) => setIsTitle(checked === true)} /> Entry title</label>
      {field.type === "component" ? <Field><FieldLabel>Linked entries</FieldLabel><Select value={isList ? "multiple" : "single"} onValueChange={(value) => setIsList(value === "multiple")}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="single">Single entry</SelectItem><SelectItem value="multiple">Multiple entries</SelectItem></SelectGroup></SelectContent></Select></Field> : null}
      <Button disabled={isPending || (field.type === "component" && !targetModelSlugs.length) || (field.type === "enum" && !areEnumOptionsValid(enumOptions))} onClick={() => run(async () => {
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
      }, "Field updated")}><Save data-icon="inline-start" /> Save field</Button>
    </FieldGroup>
  );
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
