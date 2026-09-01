"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Boxes, FileText, Plus, Save, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import type { ContentField, ContentModel, FieldInput } from "@/lib/cms/types";
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

  useEffect(() => {
    const timeout = window.setTimeout(() => setEditName(props.activeModel?.name ?? ""), 0);
    return () => window.clearTimeout(timeout);
  }, [props.activeModel?.name]);

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
    <div className="grid gap-6 xl:grid-cols-[24rem_1fr]">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><Boxes /> Models</CardTitle>
              <CardDescription>Create composable content models and switch between them.</CardDescription>
            </div>
            <Button asChild>
              <Link href={`${appPath}/models/new`}><Plus data-icon="inline-start" /> Create model</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="flex flex-col gap-2">
            {props.models.map((model) => (
              <Link key={model.id} className="rounded-xl border bg-card p-3 text-left hover:bg-muted" href={`${appPath}/models/${model.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{model.name}</span>
                  <Badge variant={model.status === "active" ? "default" : "secondary"}>{model.status}</Badge>
                </div>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{model.slug}</p>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{props.activeModel?.name ?? "Select a model"}</CardTitle>
          <CardDescription>Update metadata, archive or delete, and manage fields.</CardDescription>
        </CardHeader>
        {props.activeModel ? (
          <CardContent className="grid gap-6">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
              <Input value={editName} onChange={(event) => setEditName(event.target.value)} />
              <Button
                variant="outline"
                disabled={isPending || !editName}
                onClick={() => run(async () => { await updateModelAction(props.tenantSlug, props.activeModelId, { name: editName }); }, "Model updated")}
              >
                <Save data-icon="inline-start" /> Save
              </Button>
              {props.activeModel.status === "archived" ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" disabled={isPending || props.hasActiveModelEntries}>
                      <Trash2 data-icon="inline-start" /> Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {props.activeModel.name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This permanently deletes the model and the history of its already-deleted entries. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        onClick={() => run(async () => {
                          await deleteModelAction(props.tenantSlug, props.activeModelId);
                          router.push(`${appPath}/models`);
                        }, "Model deleted")}
                      >
                        Delete model
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <Button
                  variant="destructive"
                  disabled={isPending}
                  onClick={() => run(async () => { await archiveModelAction(props.tenantSlug, props.activeModelId); }, "Model archived")}
                >
                  <Archive data-icon="inline-start" /> Archive
                </Button>
              )}
              {props.activeModel.status === "archived" && props.hasActiveModelEntries ? (
                <p className="text-sm text-muted-foreground sm:col-span-3">Delete all entries from this model before deleting it.</p>
              ) : null}
            </div>

            <FieldEditor tenantSlug={props.tenantSlug} models={props.models} modelId={props.activeModelId} />
            <Button asChild variant="outline" className="w-fit">
              <Link href={`${appPath}/entries/${props.activeModelId}`}>
                <FileText data-icon="inline-start" /> Manage entries
              </Link>
            </Button>
            <FieldTable tenantSlug={props.tenantSlug} fields={props.fields} models={props.models} modelId={props.activeModelId} />
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
