"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Copy, KeyRound, Pencil, Plus, Terminal } from "lucide-react";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AccessTokenSummary, TenantSummary } from "@/lib/cms/types";
import type { AccessTokenPermission } from "@/modules/access-tokens/permissions";

import { createAccessTokenAction, revokeAccessTokenAction, updateAccessTokenAction } from "./actions";

type AccessTokensPanelProps = {
  accessTokens: AccessTokenSummary[];
  tenants: TenantSummary[];
};

export function AccessTokensPanel({ accessTokens, tenants }: AccessTokensPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [plaintextToken, setPlaintextToken] = useState("");

  function run(action: () => Promise<void>, success: string) {
    return new Promise<boolean>((resolve) => {
      startTransition(async () => {
        try {
          await action();
          router.refresh();
          toast.success(success);
          resolve(true);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Action failed");
          resolve(false);
        }
      });
    });
  }

  function createToken(input: { name: string; tenantId: string; expiresInDays: number | null; permissions: AccessTokenPermission[] }) {
    return new Promise<boolean>((resolve) => {
      startTransition(async () => {
        try {
          const result = await createAccessTokenAction(input);
          setPlaintextToken(result.token);
          router.refresh();
          toast.success("Access token created");
          resolve(true);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Action failed");
          resolve(false);
        }
      });
    });
  }

  return (
    <>
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2"><KeyRound /> API access</CardTitle>
                <CardDescription>Create tenant-scoped bearer tokens for content delivery and email sending.</CardDescription>
              </div>
              <CreateAccessTokenDialog
                isPending={isPending}
                tenants={tenants}
                onCreate={createToken}
              />
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accessTokens.map((accessToken) => (
                  <AccessTokenRow key={accessToken.id} accessToken={accessToken} isPending={isPending} run={run} />
                ))}
                {!accessTokens.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      No access tokens. Create one when an application is ready to use the API.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Terminal /> Request format</CardTitle>
            <CardDescription>Send tokens only in the Authorization header from a trusted server.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-xl bg-muted p-4 font-mono text-sm">Authorization: Bearer cms_at_...</pre>
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(plaintextToken)} onOpenChange={(open) => { if (!open) setPlaintextToken(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy your access token</DialogTitle>
            <DialogDescription>This secret is shown once. Store it securely before closing this dialog.</DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border bg-muted p-4 font-mono text-sm break-all">{plaintextToken}</div>
          <DialogFooter>
            <Button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(plaintextToken);
                  toast.success("Access token copied");
                } catch {
                  toast.error("The browser could not copy the token");
                }
              }}
            >
              <Copy data-icon="inline-start" /> Copy token
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CreateAccessTokenDialog({
  isPending,
  onCreate,
  tenants,
}: {
  isPending: boolean;
  onCreate: (input: { name: string; tenantId: string; expiresInDays: number | null; permissions: AccessTokenPermission[] }) => Promise<boolean>;
  tenants: TenantSummary[];
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [expiry, setExpiry] = useState("90");
  const [permissions, setPermissions] = useState<AccessTokenPermission[]>(["content:read"]);

  async function create() {
    const created = await onCreate({ name, tenantId, expiresInDays: expiry === "never" ? null : Number(expiry), permissions });
    if (!created) return;
    setName("");
    setTenantId("");
    setExpiry("90");
    setPermissions(["content:read"]);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={!tenants.length}><Plus data-icon="inline-start" /> Create token</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create access token</DialogTitle>
          <DialogDescription>Choose which operations this token can perform for one tenant.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="access-token-name">Name</FieldLabel>
            <Input id="access-token-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Production website" />
          </Field>
          <Field>
            <FieldLabel htmlFor="access-token-tenant">Tenant</FieldLabel>
            <Select value={tenantId} onValueChange={setTenantId}>
              <SelectTrigger id="access-token-tenant" className="w-full"><SelectValue placeholder="Select tenant" /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {tenants.map((tenant) => <SelectItem key={tenant.id} value={tenant.id}>{tenant.name}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="access-token-expiration">Expiration</FieldLabel>
            <Select value={expiry} onValueChange={setExpiry}>
              <SelectTrigger id="access-token-expiration" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="365">1 year</SelectItem>
                  <SelectItem value="never">Never</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>Expired tokens stop working immediately.</FieldDescription>
          </Field>
          <TokenPermissions id="create-token" permissions={permissions} onChange={setPermissions} disabled={isPending} />
        </FieldGroup>
        <DialogFooter>
          <Button disabled={isPending || !name.trim() || !tenantId || !permissions.length} onClick={create}>
            <Plus data-icon="inline-start" /> Create token
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AccessTokenRow({
  accessToken,
  isPending,
  run,
}: {
  accessToken: AccessTokenSummary;
  isPending: boolean;
  run: (action: () => Promise<void>, success: string) => Promise<boolean>;
}) {
  const status = accessTokenStatus(accessToken);

  return (
    <TableRow>
      <TableCell>
        <div className="min-w-48">
          <p className="font-medium">{accessToken.name}</p>
          <p className="font-mono text-xs text-muted-foreground">{accessToken.tokenHint}</p>
          <p className="text-xs text-muted-foreground">Created {formatDate(accessToken.createdAt)}</p>
        </div>
      </TableCell>
      <TableCell>
        <p>{accessToken.tenant.name}</p>
        <p className="text-xs text-muted-foreground">{accessToken.tenant.slug}</p>
      </TableCell>
      <TableCell>
        <Badge variant={status === "active" ? "default" : "secondary"}>{status}</Badge>
        <p className="mt-1 text-xs text-muted-foreground">{accessToken.expiresAt ? `Expires ${formatDate(accessToken.expiresAt)}` : "No expiration"}</p>
      </TableCell>
      <TableCell><div className="flex flex-wrap gap-1">{accessToken.permissions.map((permission) => <Badge key={permission} variant="outline">{permission}</Badge>)}</div></TableCell>
      <TableCell>{accessToken.lastUsedAt ? formatDate(accessToken.lastUsedAt) : "Never"}</TableCell>
      <TableCell>
        <div className="flex justify-end gap-1">
          <RenameAccessTokenDialog accessToken={accessToken} isPending={isPending} run={run} />
          {status === "active" ? <RevokeAccessTokenButton accessToken={accessToken} isPending={isPending} run={run} /> : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

function RenameAccessTokenDialog({
  accessToken,
  isPending,
  run,
}: {
  accessToken: AccessTokenSummary;
  isPending: boolean;
  run: (action: () => Promise<void>, success: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(accessToken.name);
  const [permissions, setPermissions] = useState<AccessTokenPermission[]>(accessToken.permissions.filter((value): value is AccessTokenPermission => value === "content:read" || value === "email:send"));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon-sm" variant="ghost" disabled={isPending}><Pencil /><span className="sr-only">Edit {accessToken.name}</span></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit access token</DialogTitle>
          <DialogDescription>Update the name and permissions. Permission changes take effect immediately.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`rename-token-${accessToken.id}`}>Name</FieldLabel>
            <Input id={`rename-token-${accessToken.id}`} value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <TokenPermissions id={accessToken.id} permissions={permissions} onChange={setPermissions} disabled={isPending} />
        </FieldGroup>
        <DialogFooter>
          <Button
            disabled={isPending || !name.trim() || !permissions.length}
            onClick={async () => {
              const renamed = await run(async () => { await updateAccessTokenAction(accessToken.id, { name, permissions }); }, "Access token updated");
              if (renamed) setOpen(false);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevokeAccessTokenButton({
  accessToken,
  isPending,
  run,
}: {
  accessToken: AccessTokenSummary;
  isPending: boolean;
  run: (action: () => Promise<void>, success: string) => Promise<boolean>;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="icon-sm" variant="ghost" disabled={isPending}><Ban /><span className="sr-only">Revoke {accessToken.name}</span></Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke {accessToken.name}?</AlertDialogTitle>
          <AlertDialogDescription>This immediately blocks API requests using this token. Revocation cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => run(async () => { await revokeAccessTokenAction(accessToken.id); }, "Access token revoked")}>
            Revoke token
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function TokenPermissions({ id, permissions, onChange, disabled }: {
  id: string; permissions: AccessTokenPermission[]; onChange: (permissions: AccessTokenPermission[]) => void; disabled: boolean;
}) {
  return <fieldset className="grid gap-3" disabled={disabled}>
    <legend className="mb-3 text-sm font-medium">Permissions</legend>
    {(["content:read", "email:send"] as const).map((permission) => <div key={permission} className="flex items-center gap-2">
      <Checkbox id={`${id}-${permission}`} checked={permissions.includes(permission)} onCheckedChange={(checked) => onChange(checked === true ? [...permissions, permission] : permissions.filter((value) => value !== permission))} />
      <label htmlFor={`${id}-${permission}`} className="text-sm">{permission === "content:read" ? "Read published content" : "Send email"} <span className="text-xs text-muted-foreground">({permission})</span></label>
    </div>)}
    <p className="text-xs text-muted-foreground">Select at least one permission. Email also requires enabled SMTP settings for the tenant.</p>
  </fieldset>;
}

function accessTokenStatus(accessToken: AccessTokenSummary): "active" | "expired" | "revoked" {
  if (accessToken.revokedAt) return "revoked";
  if (accessToken.expiresAt && new Date(accessToken.expiresAt).getTime() <= Date.now()) return "expired";
  return "active";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}
