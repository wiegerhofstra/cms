"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import type { ContentField, ContentModel, EntryTranslations, TenantLocalization } from "@/lib/cms/types";
import { resolvePagePath } from "@/lib/links";
import { localizeEntryData } from "@/modules/localization/locales";
import { getPageParentOptions } from "@/modules/entries/hierarchy-actions";

type ParentOption = Awaited<ReturnType<typeof getPageParentOptions>>[number];

export function PageHierarchyFields({ tenantSlug, model, fields, entryId, published, data, translations, localization, pageParentId, onChange }: {
  tenantSlug: string; model: ContentModel; fields: ContentField[]; entryId?: string; published?: boolean;
  data: Record<string, unknown>; translations: EntryTranslations; localization: TenantLocalization;
  pageParentId: string | null; onChange: (id: string | null) => void;
}) {
  const [options, setOptions] = useState<ParentOption[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getPageParentOptions(tenantSlug, model.id, entryId).then((result) => {
      if (!cancelled) setOptions(result);
    }).catch((error: unknown) => { if (!cancelled) setError(error instanceof Error ? error.message : "Could not load parent pages"); });
    return () => { cancelled = true; };
  }, [tenantSlug, model.id, entryId]);
  const parent = options?.find((option) => option.id === pageParentId);

  return <div className="mb-6 space-y-4 rounded-lg border p-4">
    <Field>
      <FieldLabel htmlFor="page-parent">Parent page</FieldLabel>
      <Button id="page-parent" variant="outline" className="justify-start" onClick={() => setOpen(true)} disabled={!options}>
        {pageParentId ? parent?.title ?? "Loading parent…" : "None — top-level page"}
      </Button>
      <FieldDescription>Pages share one hierarchy across languages. Each language uses its own slugs.</FieldDescription>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </Field>
    <div className="space-y-2 text-sm" aria-label="Page URL preview" aria-live="polite">
      {localization.locales.map((locale) => {
        const segments = pageParentId ? parent?.slugs[locale] : [];
        const path = segments ? resolvePagePath(model.pageUrl, localizeEntryData(fields, data, translations, locale, localization), locale, segments) : null;
        return <div key={locale}><span className="text-muted-foreground">Page URL{localization.locales.length > 1 ? ` (${locale})` : ""}: </span><span className="break-all font-mono">{path && path.length <= 2000 ? path : "Complete the page and parent slugs"}</span></div>;
      })}
    </div>
    {published && <p className="text-xs text-muted-foreground">Saving a changed slug or parent updates this page and its descendants immediately. Previous published URLs redirect to their new paths.</p>}
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Choose a parent page</DialogTitle><DialogDescription>Pages in this model. This page and its descendants are excluded.</DialogDescription></DialogHeader>
        <Command>
          <CommandInput placeholder="Search pages…" />
          <CommandList>
            <CommandEmpty>No matching pages.</CommandEmpty>
            <CommandItem value="none top level" onSelect={() => { onChange(null); setOpen(false); }}>None — top-level page</CommandItem>
            {options?.map((option) => <CommandItem key={option.id} value={`${option.id} ${option.title} ${(option.slugs[localization.defaultLocale] ?? []).join("/")}`} onSelect={() => { onChange(option.id); setOpen(false); }}>
              <div className="min-w-0"><div>{option.title}{option.status === "draft" ? " (draft)" : ""}</div><div className="truncate text-xs text-muted-foreground">/{option.slugs[localization.defaultLocale]?.join("/") ?? "Missing slug"}</div></div>
            </CommandItem>)}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  </div>;
}
