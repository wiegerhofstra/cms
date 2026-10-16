"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, File, FileText, Globe, Loader2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { safeLinkHref, type LinkDestination, type LinkKind, type RichTextLink } from "@/lib/links";
import { cn } from "@/lib/utils";
import { searchLinkDestinations } from "@/modules/links/actions";

export function LinkDialog({ tenantSlug, locale, initial, text, editing, onApply, onRemove, onClose }: {
  tenantSlug: string; locale: string; initial: RichTextLink; text: string; editing: boolean;
  onApply: (link: RichTextLink, label: string) => void; onRemove: () => void; onClose: () => void;
}) {
  const id = useId();
  const [kind, setKind] = useState<LinkKind>(initial.kind);
  const [label, setLabel] = useState(text);
  const [url, setUrl] = useState(initial.kind === "url" ? initial.href ?? "" : "");
  const [newTab, setNewTab] = useState(initial.target === "_blank");
  const [selected, setSelected] = useState<LinkDestination | null>(null);
  const [error, setError] = useState("");

  function apply() {
    const href = kind === "url" ? safeLinkHref(url) : null;
    if (kind === "url" && !href) { setError("Enter a valid web address, email address link (mailto:), phone link (tel:), or relative path."); return; }
    if (kind !== "url" && (!selected || selected.kind !== kind)) { setError("Choose a destination."); return; }
    const nextLabel = label.trim() ? label : selected?.title || href || "";
    onApply({ kind, href, entryId: kind === "page" ? selected!.id : null, assetId: kind === "asset" ? selected!.id : null, target: newTab ? "_blank" : null }, nextLabel);
  }

  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[calc(100dvh-2rem)] grid-cols-1 overflow-y-auto sm:max-w-lg" onCloseAutoFocus={(event) => event.preventDefault()}>
      <DialogHeader><DialogTitle>{editing ? "Edit link" : "Add link"}</DialogTitle><DialogDescription>Choose where this text should take your reader.</DialogDescription></DialogHeader>
      <Field><FieldLabel htmlFor={`${id}-label`}>Link text</FieldLabel><Input id={`${id}-label`} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Use the destination name" /></Field>
      <Tabs value={kind} onValueChange={(value) => { setKind(value as LinkKind); setSelected(null); setError(""); }}>
        <TabsList className="w-full"><TabsTrigger value="url"><Globe /> Web address</TabsTrigger><TabsTrigger value="page"><FileText /> Page</TabsTrigger><TabsTrigger value="asset"><File /> Asset</TabsTrigger></TabsList>
        <TabsContent value="url" className="pt-3"><Field><FieldLabel htmlFor={`${id}-url`}>Web address</FieldLabel><Input id={`${id}-url`} value={url} onChange={(event) => { setUrl(event.target.value); setError(""); }} placeholder="https://example.com" inputMode="url" /></Field></TabsContent>
        {(["page", "asset"] as const).map((type) => <TabsContent key={type} value={type} className="pt-3">
          <DestinationSearch tenantSlug={tenantSlug} locale={locale} kind={type} initialId={initial.kind === type ? (type === "page" ? initial.entryId : initial.assetId) : null} selected={selected} onSelect={setSelected} />
        </TabsContent>)}
      </Tabs>
      {selected && kind !== "url" && <div className="rounded-lg border bg-muted/30 px-3 py-2" aria-live="polite">
        <p className="flex items-center gap-2 font-medium"><Check className="size-4 shrink-0" /><span className="min-w-0 break-all">{selected.title}</span></p>
        <p className="mt-1 break-all text-xs text-muted-foreground">{selected.detail}</p>
        {selected.status === "draft" && <p className="mt-2 text-xs text-muted-foreground">Publish this page before publishing content that links to it.</p>}
      </div>}
      <Field orientation="horizontal"><Checkbox id={`${id}-new-tab`} checked={newTab} onCheckedChange={(value) => setNewTab(value === true)} /><FieldLabel htmlFor={`${id}-new-tab`}>Open in new tab</FieldLabel></Field>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        {editing && <Button type="button" variant="ghost" className="sm:mr-auto" onClick={onRemove}>Remove link</Button>}
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="button" onClick={apply} disabled={kind !== "url" && (!selected || selected.kind !== kind || (kind === "page" && !selected.href))}>{editing ? "Save link" : "Add link"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

function DestinationSearch({ tenantSlug, locale, kind, initialId, selected, onSelect }: {
  tenantSlug: string; locale: string; kind: "page" | "asset"; initialId: string | null;
  selected: LinkDestination | null; onSelect: (item: LinkDestination | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<LinkDestination[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const [retry, setRetry] = useState(0);
  const chosen = useRef(false);

  useEffect(() => {
    if (!initialId) return;
    let active = true;
    searchLinkDestinations(tenantSlug, { kind, id: initialId, locale }).then(({ items }) => {
      if (active && !chosen.current) { onSelect(items[0] ?? null); setMissing(!items.length); }
    }).catch(() => { if (active) setError("Could not load the linked destination."); });
    return () => { active = false; };
  }, [tenantSlug, locale, kind, initialId, onSelect, retry]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const result = await searchLinkDestinations(tenantSlug, { kind, query, page, locale });
        if (active) { setItems(result.items); setHasMore(result.hasMore); }
      } catch (error) { if (active) setError(error instanceof Error ? error.message : "Could not load destinations"); }
      finally { if (active) setLoading(false); }
    }, 200);
    return () => { active = false; window.clearTimeout(timer); };
  }, [tenantSlug, locale, kind, query, page, retry]);

  return <div className="space-y-2">
    <div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input aria-label={kind === "page" ? "Search pages" : "Search assets"} className="pl-9" placeholder={kind === "page" ? "Search pages…" : "Search files…"} value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); setLoading(true); }} /></div>
    {missing && !selected && <p role="status" className="text-xs text-destructive">The linked destination is no longer available. Choose another or remove this link.</p>}
    <div className="max-h-52 min-h-24 overflow-y-auto rounded-lg border" aria-busy={loading}>
      {loading ? <p role="status" className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</p> : error ? <div role="alert" className="p-3"><p className="text-sm text-destructive">{error}</p><Button type="button" variant="ghost" size="sm" onClick={() => setRetry((value) => value + 1)}>Try again</Button></div> : !items.length ? <p className="p-4 text-sm text-muted-foreground">{query ? "No matches. Try another search." : kind === "page" ? "No pages available. Enable page URLs in a model's settings to list its entries here." : "No files available. Upload a file in Assets first."}</p> : items.map((item) => <button key={item.id} type="button" disabled={item.kind === "page" && !item.href} aria-pressed={selected?.id === item.id} onClick={() => { chosen.current = true; onSelect(item); }} className={cn("flex w-full items-start gap-3 border-b px-3 py-2.5 text-left last:border-0 hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2 disabled:opacity-50", selected?.id === item.id && "bg-selected")}>
        {kind === "page" ? <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : <File className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
        <span className="min-w-0 flex-1"><span className="block truncate font-medium">{item.title}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.detail}</span></span>
        {item.status === "draft" && <Badge variant="outline">Draft</Badge>}{selected?.id === item.id && <Check className="mt-0.5 size-4 shrink-0" />}
      </button>)}
    </div>
    {(page > 0 || hasMore) && <div className="flex items-center justify-between"><Button type="button" size="sm" variant="ghost" disabled={loading || !page} onClick={() => { setPage(page - 1); setLoading(true); }}>Previous</Button><span className="text-xs text-muted-foreground">Page {page + 1}</span><Button type="button" size="sm" variant="ghost" disabled={loading || !hasMore} onClick={() => { setPage(page + 1); setLoading(true); }}>Next</Button></div>}
  </div>;
}
