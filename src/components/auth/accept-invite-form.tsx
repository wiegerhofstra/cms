"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { acceptInviteAction } from "@/modules/invites/actions";

export function AcceptInviteForm({ token, email: invitedEmail }: { token: string; email: string | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [email, setEmail] = useState(invitedEmail ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function createAccount() {
    setError("");
    startTransition(async () => {
      const result = await acceptInviteAction(token, { name, email, password });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/app");
      router.refresh();
    });
  }

  return (
    <form onSubmit={(event) => { event.preventDefault(); createAccount(); }}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="invite-name">Name</FieldLabel>
          <Input id="invite-name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="invite-email">Email</FieldLabel>
          <Input id="invite-email" type="email" autoComplete="email" value={email} readOnly={Boolean(invitedEmail)} onChange={(event) => setEmail(event.target.value)} />
          {invitedEmail ? <FieldDescription>This invite is for this address.</FieldDescription> : null}
        </Field>
        <Field>
          <FieldLabel htmlFor="invite-password">Password</FieldLabel>
          <Input id="invite-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <FieldDescription>Use at least 8 characters.</FieldDescription>
        </Field>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={isPending || !name.trim() || !email || password.length < 8}>
          <UserPlus data-icon="inline-start" />
          {isPending ? "Creating account…" : "Create account"}
        </Button>
      </FieldGroup>
    </form>
  );
}
