"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Boxes, ChevronRight, FileText, Plus, Save, Trash2 } from "lucide-react";
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ContentField, ContentModel, FieldInput } from "@/lib/cms/types";
import { cn } from "@/lib/utils";
import { archiveModelAction, createModelAction, deleteModelAction, updateModelAction } from "./actions";
import { FieldEditor, FieldTable } from "./model-fields";

export function ModelsPanel(props: {
  tenantSlug: string;
  models: ContentModel[];
  activeModel: ContentModel | null;
  activeModelId: string;
  fields: ContentField[];
  hasActiveModelEntries: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editName, setEditName] = useState("");
  const appPath = `/app/${props.tenantSlug}`;
  const hasNameChanges = editName.trim() !== (props.activeModel?.name ?? "") && Boolean(editName.trim());

  useEffect(() => {
    const timeout = window.setTimeout(() => setEditName(props.activeModel?.name ?? ""), 0);
    return () => window.clearTimeout(timeout);
  }, [props.activeModel?.name]);

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

  return (
    <div className="grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
      <Card className="hidden self-start xl:flex xl:sticky xl:top-28 xl:max-h-[calc(100vh-9rem)]">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><Boxes /> Models</CardTitle>
              <CardDescription>{props.models.length} model{props.models.length === 1 ? "" : "s"}</CardDescription>
            </div>
            <Button asChild size="icon" aria-label="Create model"><Link href={`${appPath}/models/new`}><Plus /></Link></Button>
          </div>
        </CardHeader>
        <CardContent className="min-h-0 overflow-y-auto">
          <nav aria-label="Content models" className="flex flex-col gap-1.5">
            {props.models.map((model) => (
              <Link
                key={model.id}
                aria-current={model.id === props.activeModelId ? "page" : undefined}
                className={cn("group rounded-xl border p-3 text-left transition-colors hover:bg-muted", model.id === props.activeModelId ? "border-accent/50 bg-muted ring-1 ring-accent/20" : "bg-card")}
                href={`${appPath}/models/${model.id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{model.name}</span>
                  <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5", model.id === props.activeModelId && "text-accent")} />
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="truncate font-mono text-xs text-muted-foreground">{model.slug}</p>
                  {model.status === "archived" ? <Badge variant="secondary">Archived</Badge> : null}
                </div>
              </Link>
            ))}
          </nav>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 rounded-xl border bg-card p-3 xl:hidden">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">Editing model</p>
          <Select value={props.activeModelId} onValueChange={(modelId) => router.push(`${appPath}/models/${modelId}`)}>
            <SelectTrigger className="mt-1 w-full"><SelectValue placeholder="Select a model" /></SelectTrigger>
            <SelectContent><SelectGroup>{props.models.map((model) => <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </div>
        <Button asChild className="mt-5" variant="outline"><Link href={`${appPath}/models/new`}><Plus data-icon="inline-start" /> New</Link></Button>
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {props.activeModel ? <Badge variant={props.activeModel.status === "active" ? "default" : "secondary"}>{props.activeModel.status === "active" ? "Active" : "Archived"}</Badge> : null}
                {props.activeModel ? <span className="font-mono text-xs text-muted-foreground">{props.activeModel.slug}</span> : null}
              </div>
              <CardTitle className="text-xl">{props.activeModel?.name ?? "Select a model"}</CardTitle>
              <CardDescription>{props.activeModel ? `${props.fields.length} field${props.fields.length === 1 ? " defines" : "s define"} this content type.` : "Choose a model to start editing."}</CardDescription>
            </div>
            {props.activeModel ? (
              <Button asChild>
                <Link href={`${appPath}/entries/${props.activeModelId}`}><FileText data-icon="inline-start" /> Manage entries</Link>
              </Button>
            ) : null}
          </div>
        </CardHeader>
        {props.activeModel ? (
          <CardContent className="grid gap-8 py-2">
            <section aria-labelledby="model-details-heading">
              <div className="mb-4">
                <h2 id="model-details-heading" className="font-medium">Model details</h2>
                <p className="mt-1 text-sm text-muted-foreground">Give editors a clear, recognizable name. The API slug stays fixed.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <Field>
                  <FieldLabel htmlFor="model-name">Name</FieldLabel>
                  <Input id="model-name" aria-label="Model name" value={editName} onChange={(event) => setEditName(event.target.value)} />
                </Field>
                <Button
                  variant="outline"
                  disabled={isPending || !hasNameChanges}
                  onClick={() => run(async () => { await updateModelAction(props.tenantSlug, props.activeModelId, { name: editName.trim() }); }, "Model updated")}
                >
                  <Save data-icon="inline-start" /> Save changes
                </Button>
              </div>
            </section>

            <section aria-labelledby="model-fields-heading">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 id="model-fields-heading" className="font-medium">Fields</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Define the structure editors fill in for each entry.</p>
                </div>
                <FieldEditor tenantSlug={props.tenantSlug} models={props.models} modelId={props.activeModelId} />
              </div>
              <FieldTable tenantSlug={props.tenantSlug} fields={props.fields} models={props.models} modelId={props.activeModelId} />
            </section>

            <section aria-labelledby="danger-zone-heading" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 id="danger-zone-heading" className="font-medium">Danger zone</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{props.activeModel.status === "archived" ? "Permanently delete this archived model." : "Archive this model to stop creating new entries."}</p>
                </div>
                {props.activeModel.status === "archived" ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" disabled={isPending || props.hasActiveModelEntries}><Trash2 data-icon="inline-start" /> Delete model</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {props.activeModel.name}?</AlertDialogTitle>
                        <AlertDialogDescription>This permanently deletes the model and the history of its already-deleted entries. This action cannot be undone.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={() => run(async () => { await deleteModelAction(props.tenantSlug, props.activeModelId); router.push(`${appPath}/models`); }, "Model deleted")}>Delete model</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button variant="destructive" disabled={isPending}><Archive data-icon="inline-start" /> Archive model</Button></AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Archive {props.activeModel.name}?</AlertDialogTitle>
                        <AlertDialogDescription>The model and its existing entries remain available, but editors will no longer be able to create new entries with it.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={() => run(() => archiveModelAction(props.tenantSlug, props.activeModelId), "Model archived")}>Archive model</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
              {props.activeModel.status === "archived" && props.hasActiveModelEntries ? <p className="mt-3 text-sm text-muted-foreground">Delete all entries from this model before deleting it.</p> : null}
            </section>
          </CardContent>
        ) : (
          <CardContent><p className="text-sm text-muted-foreground">Create or select a model.</p></CardContent>
        )}
      </Card>
    </div>
  );
}

export function ModelCreatePanel({ tenantSlug }: { tenantSlug: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [initialFields, setInitialFields] = useState("[]");
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Boxes /> Create model</CardTitle>
        <CardDescription>Create a composable content model for the active tenant.</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="model-name">Name</FieldLabel>
            <Input id="model-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Blog Post" />
          </Field>
          <Field>
            <FieldLabel htmlFor="model-slug">Slug</FieldLabel>
            <Input id="model-slug" value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="blog_post" />
          </Field>
          <Field>
            <FieldLabel htmlFor="initial-fields">Initial fields JSON</FieldLabel>
            <Textarea id="initial-fields" value={initialFields} onChange={(event) => setInitialFields(event.target.value)} rows={5} />
            <FieldDescription>Optional array of field inputs. Use isTitle on one field to label entries. Component fields use config.targetModelSlugs and config.isList.</FieldDescription>
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={isPending || !name || !slug}
              onClick={() =>
                run(async () => {
                  const fields = JSON.parse(initialFields || "[]") as FieldInput[];
                  const response = await createModelAction(tenantSlug, { name, slug, fields });
                  setName("");
                  setSlug("");
                  setInitialFields("[]");
                  router.push(`${appPath}/models/${response.model.id}`);
                  router.refresh();
                }, "Model created")
              }
            >
              <Plus data-icon="inline-start" /> Create model
            </Button>
            <Button asChild variant="outline">
              <Link href={`${appPath}/models`}>Cancel</Link>
            </Button>
          </div>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
