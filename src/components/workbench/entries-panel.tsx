"use client";

import { useEffect, useEffectEvent, useMemo, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSelectedLayoutSegment } from "next/navigation";
import { Braces, Copy, Ellipsis, PanelLeftClose, PanelLeftOpen, Plus, Search, Send, Trash2 } from "lucide-react";
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
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AssetWithPreview, ContentEntry, ContentField, ContentModel, EntryRevision, EntryTranslations, TenantLocalization } from "@/lib/cms/types";
import { cn } from "@/lib/utils";
import { createEntryAction, deleteEntryAction, publishEntryAction, searchEntriesAction, unpublishEntryAction, updateEntryAction } from "./actions";
import { EntryForm, EntryJsonDialog } from "./entry-form";
import { EntryStatusLabel, RelativeTime, StatusDot } from "./entry-status";
import { usePageTitle } from "./page-title";
import type { ComponentReferenceList } from "./types";
import { useUnsavedChangesGuard } from "./use-unsaved-changes";
import { createDefaultEntryData, entryDataSnapshot, entryTitle, formatJson, missingRequiredFields, normalizeEntryData, normalizeTranslations, stringValue, titleValue } from "./utils";

// Matches the server's entry list limit; models with more entries are searched on the server.
const entryListLimit = 100;

/** Entry list for one model, kept mounted while the editor beside it changes. */
export function EntriesWorkspace({ tenantSlug, model, fields, entries, children }: { tenantSlug: string; model: ContentModel; fields: ContentField[]; entries: ContentEntry[]; children: ReactNode }) {
  const segment = useSelectedLayoutSegment();
  const [listCollapsed] = useEntryListCollapsed();
  // The list is the only thing on the model page, so it can only be hidden next to an editor.
  const collapsed = listCollapsed && segment !== null;
  const activeEntryId = segment && segment !== "new" ? segment : undefined;
  const appPath = `/app/${tenantSlug}`;

  return (
    <div className={cn("grid gap-6 xl:h-[calc(100dvh-var(--workbench-header)-4rem)] xl:min-h-0", collapsed ? "xl:grid-cols-1" : "xl:grid-cols-[20rem_minmax(0,1fr)]")}>
      <Card className={cn("gap-0 py-0 xl:min-h-0", collapsed && "xl:hidden")}>
        <EntryListColumn key={model.id} tenantSlug={tenantSlug} appPath={appPath} model={model} fields={fields} entries={entries} activeEntryId={activeEntryId} />
      </Card>
      {children}
    </div>
  );
}

function EntryListColumn({ tenantSlug, appPath, model, fields, entries, activeEntryId }: { tenantSlug: string; appPath: string; model: ContentModel; fields: ContentField[]; entries: ContentEntry[]; activeEntryId?: string }) {
  const [query, setQuery] = useState("");
  const [serverResults, setServerResults] = useState<{ query: string; entries: ContentEntry[] } | null>(null);
  const search = query.trim().toLowerCase();
  const searchOnServer = entries.length >= entryListLimit;
  const localResults = useMemo(
    () => (search ? entries.filter((entry) => JSON.stringify(entry.data).toLowerCase().includes(search)) : entries),
    [entries, search],
  );

  useEffect(() => {
    if (!searchOnServer || !search) return;
    const timeout = window.setTimeout(() => {
      searchEntriesAction(tenantSlug, model.id, search)
        .then((results) => setServerResults({ query: search, entries: results }))
        .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Search failed"));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [model.id, search, searchOnServer, tenantSlug]);

  const visibleEntries = search && searchOnServer && serverResults?.query === search ? serverResults.entries : localResults;

  return (
    <>
      <div className="flex flex-col gap-2 border-b p-3">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-semibold">{model.name}</h2>
            <p className="text-xs text-muted-foreground">{entryCountLabel(entries.length)}{model.status === "archived" ? " in an archived model" : ""}</p>
          </div>
          {model.status === "active" ? (
            <Button asChild>
              <Link href={`${appPath}/entries/${model.id}/new`}><Plus data-icon="inline-start" /> New</Link>
            </Button>
          ) : null}
        </div>
        <div role="search" className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" aria-label={`Search ${model.name}`} placeholder="Search entries" className="pl-8" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
      </div>
      <ScrollArea className="h-80 xl:h-auto xl:min-h-0 xl:flex-1">
        <div className="p-2">
          <EntryList appPath={appPath} modelId={model.id} fields={fields} entries={visibleEntries} query={query.trim()} activeEntryId={activeEntryId} />
        </div>
      </ScrollArea>
    </>
  );
}

export function EntryEmptyState({ tenantSlug, modelId }: { tenantSlug: string; modelId: string }) {
  return (
    <Card className="xl:min-h-0">
      <CardContent className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
        <p className="font-medium">Select an entry to edit it</p>
        <p className="max-w-sm text-sm text-muted-foreground">Pick one from the list, or start a new one.</p>
        <Button asChild variant="outline" className="mt-2">
          <Link href={`/app/${tenantSlug}/entries/${modelId}/new`}><Plus data-icon="inline-start" /> New entry</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function EntryEditorPanel({ tenantSlug, model, assets, fields, componentReferences, localization, entry, revisions }: {
  tenantSlug: string;
  model: ContentModel | null;
  assets: AssetWithPreview[];
  fields: ContentField[];
  componentReferences: ComponentReferenceList[];
  localization: TenantLocalization;
  entry: ContentEntry;
  revisions: EntryRevision[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [listCollapsed, setListCollapsed] = useEntryListCollapsed();
  const savedData = useMemo(() => createDefaultEntryData(fields, entry.data), [fields, entry.data]);
  const [data, setData] = useState(savedData);
  const [translations, setTranslations] = useState<EntryTranslations>(entry.translations);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const titleField = fields.find((field) => field.isTitle) ?? null;
  const isDirty = useMemo(
    () => entryDataSnapshot(fields, data, translations) !== entryDataSnapshot(fields, savedData, entry.translations),
    [fields, data, translations, savedData, entry.translations],
  );
  const missingFields = missingRequiredFields(fields, data);
  const canSave = !isPending && isDirty && !missingFields.length;
  const isPublished = entry.status === "published";
  const title = (titleField ? titleValue(data[titleField.key]) : "") || "Untitled entry";
  const appPath = `/app/${tenantSlug}`;

  useUnsavedChangesGuard(isDirty);
  usePageTitle(title);

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
    run(() => updateEntryAction(tenantSlug, entry.id, normalizeEntryData(fields, data), normalizeTranslations(fields, translations)), "Entry saved");
  }

  function publish() {
    run(async () => {
      if (isDirty) await updateEntryAction(tenantSlug, entry.id, normalizeEntryData(fields, data), normalizeTranslations(fields, translations));
      await publishEntryAction(tenantSlug, entry.id);
    }, isDirty ? "Entry saved and published" : "Entry published");
  }

  useSaveShortcut(save);

  return (
    <EditorCard>
      <EditorBar>
        <Button variant="ghost" size="icon-sm" className="hidden xl:inline-flex" aria-label={listCollapsed ? "Show entry list" : "Hide entry list"} title={listCollapsed ? "Show entry list" : "Hide entry list"} onClick={() => setListCollapsed(!listCollapsed)}>
          {listCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-serif text-lg leading-tight font-semibold">{title}</h2>
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
      </EditorBar>

      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <Tabs defaultValue="content">
          <TabsList className="mb-4">
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="revisions">Revisions</TabsTrigger>
          </TabsList>
          <TabsContent value="content">
            <EntryForm fields={fields} assets={assets} componentReferences={componentReferences} localization={localization} data={data} translations={translations} onChange={setData} onTranslationsChange={setTranslations} />
          </TabsContent>
          <TabsContent value="revisions">
            <RevisionList revisions={revisions} />
          </TabsContent>
        </Tabs>
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
    </EditorCard>
  );
}

export function EntryCreatePanel(props: {
  tenantSlug: string;
  model: ContentModel;
  assets: AssetWithPreview[];
  fields: ContentField[];
  componentReferences: ComponentReferenceList[];
  localization: TenantLocalization;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const defaultData = useMemo(() => createDefaultEntryData(props.fields), [props.fields]);
  const [data, setData] = useState(defaultData);
  const [translations, setTranslations] = useState<EntryTranslations>({});
  const [jsonOpen, setJsonOpen] = useState(false);
  const isDirty = useMemo(() => entryDataSnapshot(props.fields, data, translations) !== entryDataSnapshot(props.fields, defaultData), [props.fields, data, translations, defaultData]);
  const missingFields = missingRequiredFields(props.fields, data);
  const canCreate = !isPending && props.model.status === "active" && !missingFields.length;
  const appPath = `/app/${props.tenantSlug}`;

  useUnsavedChangesGuard(isDirty);

  function create() {
    if (!canCreate) return;
    startTransition(async () => {
      try {
        const response = await createEntryAction(props.tenantSlug, props.model.id, normalizeEntryData(props.fields, data), normalizeTranslations(props.fields, translations));
        router.push(`${appPath}/entries/${props.model.id}/${response.entry.id}`);
        router.refresh();
        toast.success("Entry created");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action failed");
      }
    });
  }

  useSaveShortcut(create);

  return (
    <EditorCard>
      <EditorBar>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-serif text-lg leading-tight font-semibold">New {props.model.name} entry</h2>
          <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
            {missingFields.length ? <MissingFieldsLabel missingFields={missingFields} /> : <span>Creates a draft you can publish from the editor.</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link href={`${appPath}/entries/${props.model.id}`}>Cancel</Link>
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
      </EditorBar>
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <EntryForm fields={props.fields} assets={props.assets} componentReferences={props.componentReferences} localization={props.localization} data={data} translations={translations} onChange={setData} onTranslationsChange={setTranslations} />
      </div>
      <EntryJsonDialog open={jsonOpen} onOpenChange={setJsonOpen} data={data} onApply={setData} />
    </EditorCard>
  );
}

/** On wide screens the card scrolls internally; below that the window scrolls and the bar sticks under the header. */
function EditorCard({ children }: { children: ReactNode }) {
  return (
    <Card className="gap-0 overflow-visible py-0 xl:min-h-0 xl:overflow-hidden">
      <div className="xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-contain">{children}</div>
    </Card>
  );
}

function EditorBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky top-(--workbench-header) z-[5] flex flex-wrap items-center gap-x-3 gap-y-2 rounded-t-xl border-b bg-card/95 px-4 py-3 backdrop-blur xl:top-0 xl:rounded-none">
      {children}
    </div>
  );
}

function useSaveShortcut(onSave: () => void) {
  const handleSave = useEffectEvent(onSave);
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      handleSave();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
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
              className={cn("grid gap-0.5 rounded-md px-3 py-2 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50", isActive && "bg-selected hover:bg-selected")}
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

function entryCountLabel(count: number): string {
  if (count >= entryListLimit) return `Latest ${entryListLimit} entries`;
  return `${count} ${count === 1 ? "entry" : "entries"}`;
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
        <div key={revision.id} className="rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center justify-between gap-2"><Badge variant="secondary">v{revision.version}</Badge><span className="text-xs text-muted-foreground">{new Date(revision.createdAt).toLocaleString()}</span></div>
          <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-background p-3 text-xs">{formatJson(Object.keys(revision.translations).length ? { data: revision.data, translations: revision.translations } : revision.data)}</pre>
        </div>
      ))}
      {!revisions.length && <p className="text-sm text-muted-foreground">No revisions yet.</p>}
    </div>
  );
}
