"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TenantSummary } from "@/lib/cms/types";
import { createTenantAction } from "./actions";

export function TenantSettingsPanel({ tenants, activeTenantId }: { tenants: TenantSummary[]; activeTenantId: string | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

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
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Building2 /> Tenants</CardTitle>
          <CardDescription>All workspaces configured for this CMS installation.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((tenant) => (
                <TableRow key={tenant.id}>
                  <TableCell className="font-medium">{tenant.name}</TableCell>
                  <TableCell className="font-mono text-muted-foreground">/{tenant.slug}</TableCell>
                  <TableCell>{tenant.id === activeTenantId ? <Badge variant="secondary">Active</Badge> : null}</TableCell>
                </TableRow>
              ))}
              {!tenants.length ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">No tenants yet.</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plus /> Create tenant</CardTitle>
          <CardDescription>Create a workspace and make it the active tenant.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              run(async () => {
                const result = await createTenantAction({ name, slug: slug || undefined });
                setName("");
                setSlug("");
                router.push(`/app/${result.tenant.slug}`);
              }, "Tenant created");
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="tenant-name">Workspace name</FieldLabel>
                <Input id="tenant-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Acme Editorial" />
              </Field>
              <Field>
                <FieldLabel htmlFor="tenant-slug">Slug</FieldLabel>
                <Input id="tenant-slug" value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="acme-editorial" />
                <FieldDescription>Lowercase letters, numbers, and hyphens.</FieldDescription>
              </Field>
              <Field>
                <Button type="submit" disabled={isPending || !name}>
                  <Plus data-icon="inline-start" /> Create tenant
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
