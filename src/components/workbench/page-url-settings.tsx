"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ContentField, ContentModel } from "@/lib/cms/types";
import { pageUrlSchema, resolvePagePath } from "@/lib/links";
import { updateModelAction } from "./actions";

export function PageUrlSettings({ tenantSlug, model, fields, locale }: { tenantSlug: string; model: ContentModel; fields: ContentField[]; locale: string }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(Boolean(model.pageUrl));
  const [pattern, setPattern] = useState(model.pageUrl?.pattern ?? "/{slug}");
  const [slugField, setSlugField] = useState(model.pageUrl?.slugField ?? fields.find((field) => field.type === "slug")?.key ?? "");
  const [hierarchy, setHierarchy] = useState(model.pageUrl?.hierarchy ?? false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const needsSlug = pattern.includes("{slug}");
  const config = enabled ? { pattern: pattern.trim(), slugField: needsSlug ? slugField || null : null, ...(hierarchy ? { hierarchy: true } : {}) } : null;
  const preview = resolvePagePath(config, { [slugField]: "example-page" }, locale);
  const dirty = enabled !== Boolean(model.pageUrl) || (enabled && (config?.pattern !== model.pageUrl?.pattern || config?.slugField !== model.pageUrl?.slugField || hierarchy !== Boolean(model.pageUrl?.hierarchy)));

  function save() {
    const parsed = pageUrlSchema.nullable().safeParse(config);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the URL settings"); return; }
    setError("");
    startTransition(async () => {
      try {
        await updateModelAction(tenantSlug, model.id, { pageUrl: parsed.data });
        router.refresh();
        toast.success("Page URL settings saved");
      } catch (error) { setError(error instanceof Error ? error.message : "Could not save page URL settings"); }
    });
  }

  return (
    <section aria-labelledby="page-url-heading" className="border-t pt-6">
      <h2 id="page-url-heading" className="mb-4 font-medium">Page URLs</h2>
      <Field orientation="horizontal">
        <Checkbox id="page-url-enabled" checked={enabled} onCheckedChange={(value) => setEnabled(value === true)} />
        <div><FieldLabel htmlFor="page-url-enabled">Entries have a page URL</FieldLabel><FieldDescription>Make these entries available in the rich text page picker.</FieldDescription></div>
      </Field>
      {enabled && <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="page-url-pattern">URL pattern</FieldLabel>
          <Input id="page-url-pattern" value={pattern} onChange={(event) => setPattern(event.target.value)} placeholder="/news/{slug}" />
          <FieldDescription>Use {"{slug}"} for the entry slug and optionally {"{locale}"} for its language. Use / for a homepage.</FieldDescription>
        </Field>
        {needsSlug && <Field>
          <FieldLabel htmlFor="page-url-slug">Slug field</FieldLabel>
          <Select value={slugField} onValueChange={setSlugField}>
            <SelectTrigger id="page-url-slug" className="w-full"><SelectValue placeholder="Choose a slug field" /></SelectTrigger>
            <SelectContent>{fields.filter((field) => field.type === "slug").map((field) => <SelectItem key={field.id} value={field.key}>{field.label}</SelectItem>)}</SelectContent>
          </Select>
          <FieldDescription>{hierarchy ? "The field must be Required. Slugs are unique among sibling pages, even when Unique value is enabled." : "The field must have Required and Unique value enabled."}</FieldDescription>
        </Field>}
        <Field orientation="horizontal" className="sm:col-span-2">
          <Checkbox id="page-url-hierarchy" checked={hierarchy} onCheckedChange={(value) => setHierarchy(value === true)} />
          <div>
            <FieldLabel htmlFor="page-url-hierarchy">Allow parent pages</FieldLabel>
            <FieldDescription>Choose a parent from this model when editing a page. Parent slugs become part of its URL. The pattern must end in /{"{slug}"}.</FieldDescription>
          </div>
        </Field>
        <div className="sm:col-span-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Example URL </span><span className="break-all font-medium">{preview ?? "Complete the settings above"}</span>
          <p className="mt-1 text-xs text-muted-foreground">Your website needs a matching route.{!needsSlug ? " A fixed URL can belong to only one published entry." : ""}</p>
        </div>
      </div>}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      <Button type="button" variant="outline" className="mt-4" disabled={pending || !dirty} onClick={save}>{pending ? "Saving…" : "Save URL settings"}</Button>
    </section>
  );
}
