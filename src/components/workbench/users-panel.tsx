"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Shield, Trash2, UserRoundCog, Users } from "lucide-react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AppRole, ManagedUser, TenantRole, TenantSummary } from "@/lib/cms/types";
import {
  assignTenantToUserAction,
  createManagedUserAction,
  deleteManagedUserAction,
  removeTenantFromUserAction,
  updateManagedUserAction,
} from "./actions";

type UsersPanelProps = {
  users: ManagedUser[];
  tenants: TenantSummary[];
  currentUserId: string;
};

export function UsersPanel({ users, tenants, currentUserId }: UsersPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedUserId, setSelectedUserId] = useState("");
  const effectiveSelectedUserId = users.some((user) => user.id === selectedUserId) ? selectedUserId : (users[0]?.id ?? "");
  const selectedUser = users.find((user) => user.id === effectiveSelectedUserId) ?? null;

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
    <div className="grid gap-6 xl:grid-cols-[28rem_1fr]">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><Users /> Users</CardTitle>
              <CardDescription>Create accounts, assign app roles, and manage tenant access.</CardDescription>
            </div>
            <CreateUserDialog tenants={tenants} isPending={isPending} run={run} />
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[34rem] pr-3">
            <div className="flex flex-col gap-2">
              {users.map((user) => (
                <button
                  key={user.id}
                  className="rounded-xl border bg-card p-3 text-left hover:bg-muted"
                  type="button"
                  onClick={() => setSelectedUserId(user.id)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{user.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                    </div>
                    <Badge variant={user.role === "admin" ? "default" : "secondary"}>{user.role}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{user.memberships.length} tenant assignments</p>
                </button>
              ))}
              {!users.length ? <p className="text-sm text-muted-foreground">No users yet.</p> : null}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UserRoundCog /> {selectedUser?.name ?? "Select a user"}</CardTitle>
          <CardDescription>Update account details and tenant memberships.</CardDescription>
        </CardHeader>
        <CardContent>
          {selectedUser ? (
            <UserDetail
              key={selectedUser.id}
              currentUserId={currentUserId}
              isPending={isPending}
              run={run}
              selectedUser={selectedUser}
              tenants={tenants}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Create or select a user.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CreateUserDialog({ tenants, isPending, run }: { tenants: TenantSummary[]; isPending: boolean; run: (action: () => Promise<void>, success: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppRole>("user");
  const [tenantId, setTenantId] = useState("");
  const [tenantRole, setTenantRole] = useState<TenantRole>("editor");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus data-icon="inline-start" /> Create user</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create user</DialogTitle>
          <DialogDescription>Create a Better Auth account and optionally assign the first tenant.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="new-user-name">Name</FieldLabel>
            <Input id="new-user-name" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="new-user-email">Email</FieldLabel>
            <Input id="new-user-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="new-user-password">Password</FieldLabel>
            <Input id="new-user-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            <FieldDescription>Minimum 8 characters.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>App role</FieldLabel>
            <RoleSelect value={role} onValueChange={setRole} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel>Initial tenant</FieldLabel>
              <TenantSelect tenants={tenants} value={tenantId} onValueChange={setTenantId} includeNone />
            </Field>
            <Field>
              <FieldLabel>Tenant role</FieldLabel>
              <TenantRoleSelect value={tenantRole} onValueChange={setTenantRole} />
            </Field>
          </div>
        </FieldGroup>
        <DialogFooter>
          <Button
            disabled={isPending || !name || !email || password.length < 8}
            onClick={() =>
              run(async () => {
                await createManagedUserAction({
                  name,
                  email,
                  password,
                  role,
                  memberships: tenantId ? [{ tenantId, role: tenantRole }] : [],
                });
                setName("");
                setEmail("");
                setPassword("");
                setRole("user");
                setTenantId("");
                setTenantRole("editor");
                setOpen(false);
              }, "User created")
            }
          >
            <Plus data-icon="inline-start" /> Create user
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UserDetail({
  currentUserId,
  isPending,
  run,
  selectedUser,
  tenants,
}: {
  currentUserId: string;
  isPending: boolean;
  run: (action: () => Promise<void>, success: string) => void;
  selectedUser: ManagedUser;
  tenants: TenantSummary[];
}) {
  const [name, setName] = useState(selectedUser.name);
  const [email, setEmail] = useState(selectedUser.email);
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppRole>(selectedUser.role);
  const [tenantId, setTenantId] = useState("");
  const [tenantRole, setTenantRole] = useState<TenantRole>("editor");

  return (
    <div className="grid gap-6">
      <FieldGroup>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="edit-user-name">Name</FieldLabel>
            <Input id="edit-user-name" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-user-email">Email</FieldLabel>
            <Input id="edit-user-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel>App role</FieldLabel>
            <RoleSelect value={role} onValueChange={setRole} />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-user-password">New password</FieldLabel>
            <Input id="edit-user-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            <FieldDescription>Leave blank to keep the current password.</FieldDescription>
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={isPending || !name || !email || (password.length > 0 && password.length < 8)}
            onClick={() =>
              run(async () => {
                await updateManagedUserAction(selectedUser.id, { name, email, role, password: password || undefined });
                setPassword("");
              }, "User updated")
            }
          >
            <Save data-icon="inline-start" /> Save user
          </Button>
          <DeleteUserButton currentUserId={currentUserId} isPending={isPending} run={run} user={selectedUser} />
        </div>
      </FieldGroup>

      <div className="rounded-2xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">Tenant assignments</p>
            <p className="text-sm text-muted-foreground">Assign this user to tenants and choose tenant-level access.</p>
          </div>
          <Badge variant="secondary">{selectedUser.memberships.length} assigned</Badge>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_10rem_auto]">
          <TenantSelect tenants={tenants} value={tenantId} onValueChange={setTenantId} includeNone />
          <TenantRoleSelect value={tenantRole} onValueChange={setTenantRole} />
          <Button
            variant="outline"
            disabled={isPending || !tenantId}
            onClick={() =>
              run(async () => {
                await assignTenantToUserAction(selectedUser.id, { tenantId, role: tenantRole });
                setTenantId("");
                setTenantRole("editor");
              }, "Tenant assigned")
            }
          >
            <Shield data-icon="inline-start" /> Assign
          </Button>
        </div>

        <div className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {selectedUser.memberships.map((membership) => (
                <TableRow key={membership.tenantId}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{membership.tenant.name}</p>
                      <p className="text-xs text-muted-foreground">{membership.tenant.slug}</p>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="secondary">{membership.role}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => run(async () => { await removeTenantFromUserAction(selectedUser.id, membership.tenantId); }, "Tenant removed")}
                    >
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!selectedUser.memberships.length ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground">No tenant assignments.</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

function DeleteUserButton({
  currentUserId,
  isPending,
  run,
  user,
}: {
  currentUserId: string;
  isPending: boolean;
  run: (action: () => Promise<void>, success: string) => void;
  user: ManagedUser;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" disabled={isPending || currentUserId === user.id}>
          <Trash2 data-icon="inline-start" /> Delete user
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {user.name}?</AlertDialogTitle>
          <AlertDialogDescription>This permanently removes the user account and all tenant memberships.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => run(async () => { await deleteManagedUserAction(user.id); }, "User deleted")}>
            Delete user
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RoleSelect({ value, onValueChange }: { value: AppRole; onValueChange: (value: AppRole) => void }) {
  return (
    <Select value={value} onValueChange={(nextValue) => onValueChange(nextValue as AppRole)}>
      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="user">User</SelectItem>
          <SelectItem value="admin">Admin</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function TenantRoleSelect({ value, onValueChange }: { value: TenantRole; onValueChange: (value: TenantRole) => void }) {
  return (
    <Select value={value} onValueChange={(nextValue) => onValueChange(nextValue as TenantRole)}>
      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="editor">Editor</SelectItem>
          <SelectItem value="owner">Owner</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function TenantSelect({
  includeNone,
  onValueChange,
  tenants,
  value,
}: {
  includeNone?: boolean;
  onValueChange: (value: string) => void;
  tenants: TenantSummary[];
  value: string;
}) {
  return (
    <Select value={value || "none"} onValueChange={(nextValue) => onValueChange(nextValue === "none" ? "" : nextValue)}>
      <SelectTrigger className="w-full"><SelectValue placeholder="Select tenant" /></SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {includeNone ? <SelectItem value="none">No initial tenant</SelectItem> : null}
          {tenants.map((tenant) => (
            <SelectItem key={tenant.id} value={tenant.id}>{tenant.name}</SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
