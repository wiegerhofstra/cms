"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Link2, Plus } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AppRole, TenantRole, TenantSummary } from "@/lib/cms/types";
import { createInviteAction, revokeInviteAction } from "@/modules/invites/actions";
import type { InviteSummary } from "@/modules/invites/types";
import { RelativeTime } from "./entry-status";

export function InvitesPanel({ invites, tenants }: { invites: InviteSummary[]; tenants: TenantSummary[] }) {
  const pendingCount = invites.filter((invite) => invite.status === "pending").length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><Link2 /> Invite links</CardTitle>
            <CardDescription>Send someone a link to set up their own account. Each link works once.</CardDescription>
          </div>
          <CreateInviteDialog tenants={tenants} />
        </div>
      </CardHeader>
      <CardContent>
        {invites.length ? (
          <ul className="divide-y rounded-lg border">
            {invites.map((invite) => <InviteRow key={invite.id} invite={invite} />)}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">No invites yet. Create a link to invite someone.</p>
        )}
        {invites.length && !pendingCount ? <p className="mt-3 text-sm text-muted-foreground">No open invites right now.</p> : null}
      </CardContent>
    </Card>
  );
}

function InviteRow({ invite }: { invite: InviteSummary }) {
  const access = invite.memberships.length
    ? invite.memberships.map((membership) => `${membership.tenantName} (${membership.role})`).join(", ")
    : "No workspaces";

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium">{invite.email ?? "Anyone with the link"}</p>
          {invite.role === "admin" ? <Badge>admin</Badge> : null}
        </div>
        <p className="truncate text-sm text-muted-foreground" title={access}>{access}</p>
      </div>
      <InviteStatusText invite={invite} />
      {invite.status === "pending" ? <RevokeInviteButton invite={invite} /> : null}
    </li>
  );
}

function InviteStatusText({ invite }: { invite: InviteSummary }) {
  if (invite.status === "accepted") {
    return <p className="text-sm text-muted-foreground">Accepted{invite.acceptedBy ? ` by ${invite.acceptedBy}` : ""}{invite.acceptedAt ? <> <RelativeTime value={invite.acceptedAt} /></> : null}</p>;
  }
  if (invite.status === "revoked") return <p className="text-sm text-muted-foreground">Revoked</p>;
  if (invite.status === "expired") return <p className="text-sm text-muted-foreground">Expired</p>;
  return (
    <p className="text-sm">
      <span className="font-medium text-status-published">Open</span>
      <span className="text-muted-foreground">, expires <RelativeTime value={invite.expiresAt} /></span>
    </p>
  );
}

function RevokeInviteButton({ invite }: { invite: InviteSummary }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function revoke() {
    startTransition(async () => {
      const result = await revokeInviteAction(invite.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Invite revoked");
      router.refresh();
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={isPending}>Revoke</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke this invite?</AlertDialogTitle>
          <AlertDialogDescription>The link stops working immediately. Anyone who already has it won’t be able to create an account with it.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={revoke}>Revoke invite</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function CreateInviteDialog({ tenants }: { tenants: TenantSummary[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus data-icon="inline-start" /> Create invite link</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        {/* Remounted on each opening so the form always starts empty. */}
        {open ? <CreateInviteForm tenants={tenants} onDone={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function CreateInviteForm({ tenants, onDone }: { tenants: TenantSummary[]; onDone: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("user");
  const [access, setAccess] = useState<Record<string, TenantRole>>({});
  const [expiresInDays, setExpiresInDays] = useState("7");
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);

  function toggleTenant(tenantId: string, checked: boolean) {
    setAccess((current) => {
      const next = { ...current };
      if (checked) next[tenantId] = next[tenantId] ?? "editor";
      else delete next[tenantId];
      return next;
    });
  }

  function create() {
    setError("");
    startTransition(async () => {
      const result = await createInviteAction({
        email,
        role,
        memberships: Object.entries(access).map(([tenantId, tenantRole]) => ({ tenantId, role: tenantRole })),
        expiresInDays: Number(expiresInDays),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLink(`${window.location.origin}${result.data.path}`);
      router.refresh();
    });
  }

  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Invite link copied");
  }

  if (link) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Invite link created</DialogTitle>
          <DialogDescription>Copy the link now and send it to the person you’re inviting. For security it isn’t shown again; if you lose it, revoke it and create a new one.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input readOnly aria-label="Invite link" value={link} className="font-mono text-sm" onFocus={(event) => event.currentTarget.select()} />
          <Button onClick={copy}>{copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />} {copied ? "Copied" : "Copy"}</Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onDone}>Done</Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <form onSubmit={(event) => { event.preventDefault(); create(); }}>
      <DialogHeader>
        <DialogTitle>Create invite link</DialogTitle>
        <DialogDescription>Choose what the new user can access. They pick their own name and password.</DialogDescription>
      </DialogHeader>
      <FieldGroup className="py-4">
        <Field>
          <FieldLabel htmlFor="invite-email">Email (optional)</FieldLabel>
          <Input id="invite-email" type="email" placeholder="name@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
          <FieldDescription>Only this address can use the link. Leave empty to let anyone with the link create an account.</FieldDescription>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>App role</FieldLabel>
            <Select value={role} onValueChange={(value) => setRole(value as AppRole)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup><SelectItem value="user">User</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectGroup></SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Link expires after</FieldLabel>
            <Select value={expiresInDays} onValueChange={setExpiresInDays}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup><SelectItem value="1">1 day</SelectItem><SelectItem value="7">7 days</SelectItem><SelectItem value="30">30 days</SelectItem></SelectGroup></SelectContent>
            </Select>
          </Field>
        </div>
        <Field>
          <FieldLabel>Workspace access</FieldLabel>
          {tenants.length ? (
            <div className="divide-y rounded-lg border">
              {tenants.map((tenant) => {
                const checked = tenant.id in access;
                return (
                  <div key={tenant.id} className="flex items-center gap-3 px-3 py-2">
                    <Checkbox id={`invite-tenant-${tenant.id}`} checked={checked} onCheckedChange={(value) => toggleTenant(tenant.id, value === true)} />
                    <label htmlFor={`invite-tenant-${tenant.id}`} className="min-w-0 flex-1 truncate text-sm">{tenant.name}</label>
                    <Select disabled={!checked} value={access[tenant.id] ?? "editor"} onValueChange={(value) => setAccess((current) => ({ ...current, [tenant.id]: value as TenantRole }))}>
                      <SelectTrigger size="sm" className="w-28" aria-label={`Role in ${tenant.name}`}><SelectValue /></SelectTrigger>
                      <SelectContent><SelectGroup><SelectItem value="editor">Editor</SelectItem><SelectItem value="owner">Owner</SelectItem></SelectGroup></SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          ) : (
            <FieldDescription>There are no workspaces yet. You can give access later from the user’s settings.</FieldDescription>
          )}
        </Field>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={isPending}>{isPending ? "Creating…" : "Create link"}</Button>
      </DialogFooter>
    </form>
  );
}
