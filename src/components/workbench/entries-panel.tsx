"use client";

import { useEffect, useEffectEvent, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Braces, Copy, Ellipsis, FileText, PanelLeftClose, PanelLeftOpen, Plus, Search, Send, Trash2 } from "lucide-react";
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
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AssetWithPreview, ContentEntry, ContentField, ContentModel, EntryRevision, EntryStatus } from "@/lib/cms/types";
import { cn } from "@/lib/utils";
import { createEntryAction, deleteEntryAction, publishEntryAction, unpublishEntryAction, updateEntryAction } from "./actions";
import { EntryForm, EntryJsonDialog } from "./entry-form";
import type { ComponentReferenceList } from "./types";
import { confirmDiscardChanges, useUnsavedChangesGuard } from "./use-unsaved-changes";
import { createDefaultEntryData, entryDataSnapshot, entryTitle, formatJson, missingRequiredFields, normalizeEntryData, stringValue, titleValue } from "./utils";

// Sticky editor bars sit below the sticky workbench header when the window scrolls.
const belowWorkbenchHeader = "top-[5.3125rem]";

export function EntriesIndexPanel(props: {
  tenantSlug: string;
  models: ContentModel[];
  fields: ContentField[];
  entries: ContentEntry[];
  activeModelId: string;
  query: string;
}) {
  const selectedModel = props.models.find((model) => model.id === props.activeModelId) ?? null;
  const appPath = `/app/${props.tenantSlug}`;

  return (
    <div className="grid gap-6 xl:grid-cols-[24rem_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText /> Entries</CardTitle>
          <CardDescription>Select a model to browse and create entries.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-col gap-2">
            {props.models.map((model) => (
              <Link
                key={model.id}
                href={`${appPath}/entries/${model.id}`}
                className={cn("rounded-xl border bg-card p-3 text-left hover:bg-muted", model.id === props.activeModelId && "bg-muted")}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{model.name}</span>
                  <Badge variant={model.status === "active" ? "default" : "secondary"}>{model.status}</Badge>
                </div>
                <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{model.slug}</p>
              </Link>
            ))}
            {!props.models.length && <p className="rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground">No models available. Create a model before adding entries.</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>{selectedModel ? `${selectedModel.name} entries` : "Select a model"}</CardTitle>
              <CardDescription>{selectedModel ? entryCountLabel(props.entries.length, props.query) : "Choose an available model to view entries."}</CardDescription>
            </div>
            {props.activeModelId ? (
              <Button asChild>
                <Link href={`${appPath}/entries/${props.activeModelId}/new`}><Plus data-icon="inline-start" /> Create entry</Link>
              </Button>
            ) : (
              <Button disabled><Plus data-icon="inline-start" /> Create entry</Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          {selectedModel ? (
            <>
              <EntrySearch key={props.query} appPath={appPath} modelId={props.activeModelId} query={props.query} />
              <EntryList appPath={appPath} modelId={props.activeModelId} fields={props.fields} entries={props.entries} query={props.query} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Select a model from the list to show its entries.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function EntriesPanel(props: {
  tenantSlug: string;
  models: ContentModel[];
  assets: AssetWithPreview[];
  fields: ContentField[];
  entries: ContentEntry[];
  componentReferences: ComponentReferenceList[];
  entry: ContentEntry | null;
  revisions: EntryRevision[];
  activeModelId: string;
  activeEntryId: string;
  query: string;
}) {
  const router = useRouter();
  const [listCollapsed, setListCollapsed] = useEntryListCollapsed();
  const selectedModel = props.models.find((model) => model.id === props.activeModelId) ?? null;
  const appPath = `/app/${props.tenantSlug}`;

  return (
    <div className={cn("grid gap-6 xl:h-[calc(100dvh-9.3125rem)] xl:min-h-0", listCollapsed ? "xl:grid-cols-1" : "xl:grid-cols-[20rem_minmax(0,1fr)]")}>
      <Card className={cn("gap-0 py-0 xl:min-h-0", listCollapsed && "xl:hidden")}>
        <div className="flex flex-col gap-2 border-b p-3">
          <div className="flex items-center gap-2">
            <Select value={props.activeModelId} onValueChange={(value) => { if (confirmDiscardChanges()) router.push(`${appPath}/entries/${value}`); }}>
              <SelectTrigger aria-label="Model" className="min-w-0 flex-1"><SelectValue placeholder="Model" /></SelectTrigger>
              <SelectContent><SelectGroup>{props.models.map((model) => <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
            {props.activeModelId ? (
              <Button asChild>
                <Link href={`${appPath}/entries/${props.activeModelId}/new`}><Plus data-icon="inline-start" /> New</Link>
              </Button>
            ) : null}
          </div>
          {props.activeModelId ? <EntrySearch key={props.query} appPath={appPath} modelId={props.activeModelId} query={props.query} /> : null}
        </div>
        <ScrollArea className="h-80 xl:h-auto xl:min-h-0 xl:flex-1">
          <div className="p-2">
            <EntryList appPath={appPath} modelId={props.activeModelId} fields={props.fields} entries={props.entries} query={props.query} activeEntryId={props.activeEntryId} />
          </div>
        </ScrollArea>
      </Card>

      {props.entry ? (
        <EntryEditor
          key={`${props.entry.id}:${props.entry.updatedAt}`}
          tenantSlug={props.tenantSlug}
          model={selectedModel}
          assets={props.assets}
          fields={props.fields}
          componentReferences={props.componentReferences}
          entry={props.entry}
          revisions={props.revisions}
          listCollapsed={listCollapsed}
          onToggleList={() => setListCollapsed(!listCollapsed)}
        />
      ) : (
        <Card className="xl:min-h-0">
          <CardContent className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
            <p className="font-medium">Select an entry</p>
            <p className="text-sm text-muted-foreground">Choose an entry from the list to edit it.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EntryEditor({ tenantSlug, model, assets, fields, componentReferences, entry, revisions, listCollapsed, onToggleList }: {
  tenantSlug: string;
  model: ContentModel | null;
  assets: AssetWithPreview[];
  fields: ContentField[];
  componentReferences: ComponentReferenceList[];
  entry: ContentEntry;
  revisions: EntryRevision[];
  listCollapsed: boolean;
  onToggleList: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const savedData = useMemo(() => createDefaultEntryData(fields, entry.data), [fields, entry.data]);
  const [data, setData] = useState(savedData);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const titleField = fields.find((field) => field.isTitle) ?? null;
  const isDirty = useMemo(() => entryDataSnapshot(fields, data) !== entryDataSnapshot(fields, savedData), [fields, data, savedData]);
  const missingFields = missingRequiredFields(fields, data);
  const canSave = !isPending && isDirty && !missingFields.length;
  const isPublished = entry.status === "published";
  const title = (titleField ? titleValue(data[titleField.key]) : "") || "Untitled entry";
  const appPath = `/app/${tenantSlug}`;

  useUnsavedChangesGuard(isDirty);

  function run(action: () => Promise<unknown>, success: string) {
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

  function save() {
    if (!canSave) return;
    run(() => updateEntryAction(tenantSlug, entry.id, normalizeEntryData(fields, data)), "Entry saved");
  }

  function publish() {
    run(async () => {
      if (isDirty) await updateEntryAction(tenantSlug, entry.id, normalizeEntryData(fields, data));
      await publishEntryAction(tenantSlug, entry.id);
    }, isDirty ? "Entry saved and published" : "Entry published");
  }

  const onSaveShortcut = useEffectEvent(save);
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      onSaveShortcut();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <Card className="gap-0 overflow-visible py-0 xl:min-h-0 xl:overflow-hidden">
      <div className="xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-contain">
        <div className={cn("sticky z-[5] flex flex-wrap items-center gap-x-3 gap-y-2 rounded-t-xl border-b bg-card/95 px-4 py-3 backdrop-blur xl:top-0 xl:rounded-none", belowWorkbenchHeader)}>
          <Button variant="ghost" size="icon-sm" className="hidden xl:inline-flex" aria-label={listCollapsed ? "Show entry list" : "Hide entry list"} title={listCollapsed ? "Show entry list" : "Hide entry list"} onClick={onToggleList}>
            {listCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold">{title}</h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {model ? <span>{model.name}</span> : null}
              <EntryStatusLabel status={entry.status} />
              <SaveState isDirty={isDirty} missingFields={missingFields} updatedAt={entry.updatedAt} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isPublished ? (
              <>
                <Button variant="outline" disabled={isPending || isDirty} title={isDirty ? "Save your changes before unpublishing" : undefined} onClick={() => run(() => unpublishEntryAction(tenantSlug, entry.id), "Entry unpublished")}>
                  Unpublish
                </Button>
                <Button disabled={!canSave} title="Save (Ctrl+S)" onClick={save}>{isPending ? "Saving…" : "Save"}</Button>
              </>
            ) : (
              <>
                <Button variant="outline" disabled={!canSave} title="Save (Ctrl+S)" onClick={save}>Save</Button>
                <Button disabled={isPending || missingFields.length > 0} onClick={publish}>
                  <Send data-icon="inline-start" /> {isDirty ? "Save and publish" : "Publish"}
                </Button>
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="More entry actions"><Ellipsis /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                <DropdownMenuItem onSelect={() => setJsonOpen(true)}><Braces /> Edit as JSON</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => { void navigator.clipboard.writeText(entry.id).then(() => toast.success("Entry ID copied")); }}><Copy /> Copy entry ID</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" disabled={isPending} onSelect={() => setDeleteOpen(true)}><Trash2 /> Delete entry</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          <Tabs defaultValue="content">
            <TabsList className="mb-4">
              <TabsTrigger value="content">Content</TabsTrigger>
              <TabsTrigger value="revisions">Revisions</TabsTrigger>
            </TabsList>
            <TabsContent value="content">
              <EntryForm fields={fields} assets={assets} componentReferences={componentReferences} data={data} onChange={setData} />
            </TabsContent>
            <TabsContent value="revisions">
              <RevisionList revisions={revisions} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <EntryJsonDialog open={jsonOpen} onOpenChange={setJsonOpen} data={data} onApply={setData} />
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {entryTitle(entry, titleField)}?</AlertDialogTitle>
            <AlertDialogDescription>This removes the entry from the CMS. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => run(async () => { await deleteEntryAction(tenantSlug, entry.id); router.push(`${appPath}/entries/${entry.modelId}`); }, "Entry deleted")}>
              Delete entry
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export function EntryCreatePanel(props: {
  tenantSlug: string;
  models: ContentModel[];
  assets: AssetWithPreview[];
  fields: ContentField[];
  componentReferences: ComponentReferenceList[];
  activeModelId: string;
}) {
  return <EntryCreateForm key={props.activeModelId} {...props} />;
}

function EntryCreateForm(props: {
  tenantSlug: string;
  models: ContentModel[];
  assets: AssetWithPreview[];
  fields: ContentField[];
  componentReferences: ComponentReferenceList[];
  activeModelId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const defaultData = useMemo(() => createDefaultEntryData(props.fields), [props.fields]);
  const [data, setData] = useState(defaultData);
  const [jsonOpen, setJsonOpen] = useState(false);
  const selectedModel = props.models.find((model) => model.id === props.activeModelId);
  const isDirty = useMemo(() => entryDataSnapshot(props.fields, data) !== entryDataSnapshot(props.fields, defaultData), [props.fields, data, defaultData]);
  const missingFields = missingRequiredFields(props.fields, data);
  const canCreate = !isPending && Boolean(props.activeModelId) && !missingFields.length;
  const appPath = `/app/${props.tenantSlug}`;

  useUnsavedChangesGuard(isDirty);

  function create() {
    if (!canCreate) return;
    startTransition(async () => {
      try {
        const response = await createEntryAction(props.tenantSlug, props.activeModelId, normalizeEntryData(props.fields, data));
        router.push(`${appPath}/entries/${props.activeModelId}/${response.entry.id}`);
        router.refresh();
        toast.success("Entry created");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action failed");
      }
    });
  }

  const onCreateShortcut = useEffectEvent(create);
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      onCreateShortcut();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <Card className="gap-0 overflow-visible py-0">
      <div className={cn("sticky z-[5] flex flex-wrap items-center gap-x-3 gap-y-2 rounded-t-xl border-b bg-card/95 px-4 py-3 backdrop-blur", belowWorkbenchHeader)}>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">New {selectedModel?.name ?? ""} entry</h2>
          <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
            {missingFields.length ? <MissingFieldsLabel missingFields={missingFields} /> : <span>Creates a draft you can publish from the editor.</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link href={props.activeModelId ? `${appPath}/entries/${props.activeModelId}` : `${appPath}/entries`}>Cancel</Link>
          </Button>
          <Button disabled={!canCreate} title="Create draft (Ctrl+S)" onClick={create}>
            <Plus data-icon="inline-start" /> {isPending ? "Creating…" : "Create draft"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More entry actions"><Ellipsis /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuItem onSelect={() => setJsonOpen(true)}><Braces /> Edit as JSON</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
        <Field>
          <FieldLabel>Model</FieldLabel>
          <Select value={props.activeModelId} onValueChange={(value) => { if (confirmDiscardChanges()) router.push(`${appPath}/entries/${value}/new`); }}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Model" /></SelectTrigger>
            <SelectContent><SelectGroup>{props.models.map((model) => <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </Field>
        <EntryForm fields={props.fields} assets={props.assets} componentReferences={props.componentReferences} data={data} onChange={setData} />
      </div>
      <EntryJsonDialog open={jsonOpen} onOpenChange={setJsonOpen} data={data} onApply={setData} />
    </Card>
  );
}

function EntrySearch({ appPath, modelId, query: initialQuery }: { appPath: string; modelId: string; query: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);

  return (
    <form
      role="search"
      className="relative"
      onSubmit={(event) => {
        event.preventDefault();
        if (!confirmDiscardChanges()) return;
        const trimmed = query.trim();
        router.push(`${appPath}/entries/${modelId}${trimmed ? `?q=${encodeURIComponent(trimmed)}` : ""}`);
      }}
    >
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input type="search" aria-label="Search entries" placeholder="Search entries" className="pl-8" value={query} onChange={(event) => setQuery(event.target.value)} />
    </form>
  );
}

function EntryList({ appPath, modelId, fields, entries, query, activeEntryId }: { appPath: string; modelId: string; fields: ContentField[]; entries: ContentEntry[]; query: string; activeEntryId?: string }) {
  const titleField = fields.find((field) => field.isTitle) ?? null;
  const slugField = fields.find((field) => field.type === "slug") ?? null;

  if (!entries.length) {
    return <p className="px-3 py-8 text-center text-sm text-muted-foreground">{query ? `No entries match “${query}”.` : "No entries yet. Create the first one."}</p>;
  }

  return (
    <ul className="flex flex-col gap-0.5">
      {entries.map((entry) => {
        const isActive = entry.id === activeEntryId;
        const slug = slugField ? stringValue(entry.data[slugField.key]) : "";
        return (
          <li key={entry.id}>
            <Link
              href={`${appPath}/entries/${modelId}/${entry.id}`}
              aria-current={isActive ? "page" : undefined}
              className={cn("grid gap-0.5 rounded-lg px-3 py-2 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50", isActive && "bg-muted")}
            >
              <span className="flex min-w-0 items-center gap-2">
                <StatusDot status={entry.status} />
                <span className="min-w-0 flex-1 truncate font-medium">{entryTitle(entry, titleField)}</span>
                <RelativeTime className="shrink-0 text-xs text-muted-foreground" value={entry.updatedAt} />
              </span>
              <span className="flex min-w-0 items-center gap-2 pl-4 text-xs text-muted-foreground">
                {entry.status === "draft" ? <span className="shrink-0 font-medium text-status-draft">Draft</span> : null}
                {slug ? <span className="truncate font-mono">/{slug}</span> : null}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function StatusDot({ status }: { status: EntryStatus }) {
  return (
    <span
      aria-label={status === "published" ? "Published" : "Draft"}
      role="img"
      className={cn("size-2 shrink-0 rounded-full", status === "published" ? "bg-status-published" : "bg-status-draft")}
    />
  );
}

function EntryStatusLabel({ status }: { status: EntryStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
      <span aria-hidden className={cn("size-2 rounded-full", status === "published" ? "bg-status-published" : "bg-status-draft")} />
      {status === "published" ? "Published" : "Draft"}
    </span>
  );
}

function SaveState({ isDirty, missingFields, updatedAt }: { isDirty: boolean; missingFields: ContentField[]; updatedAt: string }) {
  if (missingFields.length) return <MissingFieldsLabel missingFields={missingFields} />;
  if (isDirty) return <span className="font-medium text-status-draft">Unsaved changes</span>;
  return <span>Saved <RelativeTime value={updatedAt} /></span>;
}

function MissingFieldsLabel({ missingFields }: { missingFields: ContentField[] }) {
  const labels = missingFields.map((field) => field.label).join(", ");
  return (
    <span className="text-destructive" title={labels}>
      {missingFields.length === 1 ? `${missingFields[0]?.label} is required` : `${missingFields.length} required fields are empty`}
    </span>
  );
}

const relativeTimeFormat = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "short" });
const relativeTimeUnits: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

function formatRelativeTime(value: string): string {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  for (const [unit, unitSeconds] of relativeTimeUnits) {
    if (Math.abs(seconds) >= unitSeconds) return relativeTimeFormat.format(Math.round(seconds / unitSeconds), unit);
  }
  return "just now";
}

function RelativeTime({ value, className }: { value: string; className?: string }) {
  // Server and browser clocks and locales differ, so the rendered text may legitimately change on hydration.
  return (
    <time dateTime={value} title={new Date(value).toLocaleString()} className={className} suppressHydrationWarning>
      {formatRelativeTime(value)}
    </time>
  );
}

function entryCountLabel(count: number, query: string): string {
  const entries = `${count} ${count === 1 ? "entry" : "entries"}`;
  return query ? `${entries} matching “${query}”` : entries;
}

const entryListCollapsedKey = "cms:entry-list-collapsed";
const entryListListeners = new Set<() => void>();

function subscribeEntryListCollapsed(listener: () => void) {
  entryListListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    entryListListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function useEntryListCollapsed() {
  const collapsed = useSyncExternalStore(subscribeEntryListCollapsed, () => window.localStorage.getItem(entryListCollapsedKey) === "1", () => false);

  function setCollapsed(value: boolean) {
    window.localStorage.setItem(entryListCollapsedKey, value ? "1" : "0");
    entryListListeners.forEach((listener) => listener());
  }

  return [collapsed, setCollapsed] as const;
}

function RevisionList({ revisions }: { revisions: EntryRevision[] }) {
  const newestFirst = [...revisions].reverse();

  return (
    <div className="flex flex-col gap-3">
      {newestFirst.map((revision) => (
        <div key={revision.id} className="rounded-xl border bg-muted/30 p-3">
          <div className="flex items-center justify-between gap-2"><Badge variant="secondary">v{revision.version}</Badge><span className="text-xs text-muted-foreground">{new Date(revision.createdAt).toLocaleString()}</span></div>
          <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-background p-3 text-xs">{formatJson(revision.data)}</pre>
        </div>
      ))}
      {!revisions.length && <p className="text-sm text-muted-foreground">No revisions yet.</p>}
    </div>
  );
}
