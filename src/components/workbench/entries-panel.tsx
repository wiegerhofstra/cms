"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Plus, Save, Search, Send, Trash2 } from "lucide-react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AssetWithPreview, ContentEntry, ContentField, ContentModel, EntryRevision } from "@/lib/cms/types";
import { cn } from "@/lib/utils";
import { createEntryAction, deleteEntryAction, publishEntryAction, unpublishEntryAction, updateEntryAction } from "./actions";
import { AdvancedJsonEditor, EntryForm } from "./entry-form";
import type { ComponentReferenceList } from "./types";
import { createDefaultEntryData, entryTitle, formatJson, hasMissingRequiredFields, normalizeEntryData, parseJsonObject } from "./utils";

export function EntriesIndexPanel(props: {
  tenantSlug: string;
  models: ContentModel[];
  fields: ContentField[];
  entries: ContentEntry[];
  activeModelId: string;
  query: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(props.query);
  const selectedModel = props.models.find((model) => model.id === props.activeModelId) ?? null;
  const titleField = props.fields.find((field) => field.isTitle) ?? null;
  const appPath = `/app/${props.tenantSlug}`;

  function searchEntries() {
    if (!props.activeModelId) return;
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    router.push(`${appPath}/entries/${props.activeModelId}${params.size ? `?${params.toString()}` : ""}`);
  }

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
              <CardDescription>{selectedModel ? "Search entries or create a new draft." : "Choose an available model to view entries."}</CardDescription>
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
        <CardContent className="grid gap-4">
          {selectedModel ? (
            <>
              <div className="flex gap-2">
                <Input placeholder="Search entries" value={query} onChange={(event) => setQuery(event.target.value)} />
                <Button variant="outline" onClick={searchEntries}><Search data-icon="inline-start" /> Search</Button>
              </div>
              <Separator />
              <div className="flex flex-col gap-2">
                {props.entries.map((item) => {
                  const title = entryTitle(item, titleField);
                  return (
                    <Link key={item.id} href={`${appPath}/entries/${props.activeModelId}/${item.id}`} className="rounded-xl border bg-card p-3 text-left hover:bg-muted">
                      <div className="flex items-center justify-between gap-2"><span className="truncate font-medium">{title}</span><Badge>{item.status}</Badge></div>
                      <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{titleField ? item.id : formatJson(item.data)}</p>
                    </Link>
                  );
                })}
                {!props.entries.length && <p className="rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground">No entries found for this model.</p>}
              </div>
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
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(props.query);
  const [editData, setEditData] = useState<Record<string, unknown>>({});
  const [editJson, setEditJson] = useState("{}");
  const titleField = props.fields.find((field) => field.isTitle) ?? null;
  const selectedModel = props.models.find((model) => model.id === props.activeModelId);
  const entryData = props.entry?.data;
  const saveDisabled = isPending || !props.entry || hasMissingRequiredFields(props.fields, editData);
  const appPath = `/app/${props.tenantSlug}`;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const data = entryData ? createDefaultEntryData(props.fields, entryData) : {};
      setEditData(data);
      setEditJson(formatJson(data));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [entryData, props.entry?.id, props.fields]);

  function syncEditJson(value: Record<string, unknown>) {
    setEditData(value);
    setEditJson(formatJson(value));
  }

  function searchEntries() {
    if (!props.activeModelId) return;
    router.push(`${appPath}/entries/${props.activeModelId}${query ? `?q=${encodeURIComponent(query)}` : ""}`);
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
    <div className="grid gap-6 xl:h-[calc(100dvh-9.3125rem)] xl:min-h-0 xl:grid-cols-[24rem_1fr]">
      <Card className="xl:min-h-0">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><FileText /> Entries</CardTitle>
              <CardDescription>Create and search entries for the selected model.</CardDescription>
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
        <CardContent className="flex flex-col gap-4 xl:min-h-0 xl:flex-1">
          <Select value={props.activeModelId} onValueChange={(value) => { router.push(`${appPath}/entries/${value}`); }}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Model" /></SelectTrigger>
            <SelectContent><SelectGroup>{props.models.map((model) => <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
          <div className="flex gap-2">
            <Input placeholder="Search entries" value={query} onChange={(event) => setQuery(event.target.value)} />
            <Button variant="outline" onClick={searchEntries}><Search data-icon="inline-start" /> Search</Button>
          </div>
          <Separator />
          <ScrollArea className="h-80 pr-3 xl:h-auto xl:min-h-0 xl:flex-1">
            <div className="flex flex-col gap-2">
              {props.entries.map((item) => {
                const title = entryTitle(item, titleField);
                return (
                  <Link key={item.id} href={`${appPath}/entries/${props.activeModelId}/${item.id}`} className="rounded-xl border bg-card p-3 text-left hover:bg-muted">
                    <div className="flex items-center justify-between gap-2"><span className="truncate font-medium">{title}</span><Badge>{item.status}</Badge></div>
                    <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{titleField ? item.id : formatJson(item.data)}</p>
                  </Link>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="xl:min-h-0">
        <CardHeader>
          <CardTitle>{props.entry ? `Edit ${selectedModel?.name ?? "entry"}` : "Select an entry"}</CardTitle>
          <CardDescription>Update data, publish state, revisions, and component references.</CardDescription>
        </CardHeader>
        {props.entry ? (
          <CardContent className="flex flex-col gap-6 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-contain">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{props.entry.status}</Badge>
              <Badge variant="outline">{props.entry.id}</Badge>
            </div>
            <Tabs defaultValue="content">
              <TabsList className="grid w-full grid-cols-2 sm:w-fit">
                <TabsTrigger value="content">Content</TabsTrigger>
                <TabsTrigger value="revisions">Revisions</TabsTrigger>
              </TabsList>
              <TabsContent value="content" className="flex flex-col gap-6">
                <EntryForm fields={props.fields} assets={props.assets} componentReferences={props.componentReferences} data={editData} mode="edit" onChange={syncEditJson} />
                <AdvancedJsonEditor value={editJson} onChange={setEditJson} onApply={() => syncEditJson(parseJsonObject(editJson))} />
                <div className="flex flex-wrap gap-2">
                  <Button disabled={saveDisabled} onClick={() => run(async () => { await updateEntryAction(props.tenantSlug, props.entry!.id, normalizeEntryData(props.fields, editData)); }, "Entry saved")}><Save data-icon="inline-start" /> Save</Button>
                  {props.entry.status === "published" ? (
                    <Button variant="outline" disabled={isPending} onClick={() => run(async () => { await unpublishEntryAction(props.tenantSlug, props.entry!.id); }, "Entry unpublished")}>Unpublish</Button>
                  ) : (
                    <Button variant="outline" disabled={isPending} onClick={() => run(async () => { await publishEntryAction(props.tenantSlug, props.entry!.id); }, "Entry published")}><Send data-icon="inline-start" /> Publish</Button>
                  )}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" disabled={isPending}><Trash2 data-icon="inline-start" /> Delete</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {entryTitle(props.entry, titleField)}?</AlertDialogTitle>
                        <AlertDialogDescription>This removes the entry from the CMS. This action cannot be undone.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={() => run(async () => { await deleteEntryAction(props.tenantSlug, props.entry!.id); router.push(props.activeModelId ? `${appPath}/entries/${props.activeModelId}` : `${appPath}/entries`); }, "Entry deleted")}>
                          Delete entry
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </TabsContent>
              <TabsContent value="revisions">
                <RevisionList revisions={props.revisions} />
              </TabsContent>
            </Tabs>
          </CardContent>
        ) : (
          <CardContent><p className="text-sm text-muted-foreground">Select or create an entry.</p></CardContent>
        )}
      </Card>
    </div>
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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [createData, setCreateData] = useState<Record<string, unknown>>({});
  const [createJson, setCreateJson] = useState("{}");
  const selectedModel = props.models.find((model) => model.id === props.activeModelId);
  const createDisabled = isPending || !props.activeModelId || hasMissingRequiredFields(props.fields, createData);
  const appPath = `/app/${props.tenantSlug}`;

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

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const data = createDefaultEntryData(props.fields);
      setCreateData(data);
      setCreateJson(formatJson(data));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [props.activeModelId, props.fields]);

  function syncCreateJson(value: Record<string, unknown>) {
    setCreateData(value);
    setCreateJson(formatJson(value));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><FileText /> Create entry</CardTitle>
        <CardDescription>Create a draft {selectedModel?.name ?? "entry"} entry.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Field>
          <FieldLabel>Model</FieldLabel>
          <Select value={props.activeModelId} onValueChange={(value) => { router.push(`${appPath}/entries/${value}/new`); }}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Model" /></SelectTrigger>
            <SelectContent><SelectGroup>{props.models.map((model) => <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </Field>
        <EntryForm fields={props.fields} assets={props.assets} componentReferences={props.componentReferences} data={createData} mode="create" onChange={syncCreateJson} />
        <AdvancedJsonEditor value={createJson} onChange={setCreateJson} onApply={() => syncCreateJson(parseJsonObject(createJson))} />
        <div className="flex flex-wrap gap-2">
          <Button disabled={createDisabled} onClick={() => run(async () => {
            const response = await createEntryAction(props.tenantSlug, props.activeModelId, normalizeEntryData(props.fields, createData));
            const data = createDefaultEntryData(props.fields);
            syncCreateJson(data);
              router.push(`${appPath}/entries/${props.activeModelId}/${response.entry.id}`);
            router.refresh();
          }, "Entry created")}>
            <Plus data-icon="inline-start" /> Create draft entry
          </Button>
          <Button asChild variant="outline">
              <Link href={props.activeModelId ? `${appPath}/entries/${props.activeModelId}` : `${appPath}/entries`}>Cancel</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RevisionList({ revisions }: { revisions: EntryRevision[] }) {
  const newestFirst = [...revisions].reverse();

  return (
    <div className="rounded-2xl border p-4">
      <p className="mb-4 text-sm font-medium">Revisions</p>
      <ScrollArea className="h-60 pr-3">
        <div className="flex flex-col gap-3">
          {newestFirst.map((revision) => (
            <div key={revision.id} className="rounded-xl border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2"><Badge variant="secondary">v{revision.version}</Badge><span className="text-xs text-muted-foreground">{new Date(revision.createdAt).toLocaleString()}</span></div>
              <pre className="mt-3 overflow-x-auto rounded-lg bg-background p-3 text-xs">{formatJson(revision.data)}</pre>
            </div>
          ))}
          {!revisions.length && <p className="text-sm text-muted-foreground">No revisions yet.</p>}
        </div>
      </ScrollArea>
    </div>
  );
}
