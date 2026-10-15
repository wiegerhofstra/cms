"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";

export function LoginClient() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function signIn() {
    startTransition(async () => {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        toast.error(result.error.message ?? "Sign in failed");
        return;
      }
      toast.success("Signed in");
      router.push("/app");
      router.refresh();
    });
  }

  return (
    <AuthPageShell title="Sign in" description="Use the email address and password for your account.">
      <form onSubmit={(event) => { event.preventDefault(); signIn(); }}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="signin-email">Email</FieldLabel>
            <Input id="signin-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="signin-password">Password</FieldLabel>
            <Input id="signin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </Field>
          <Button type="submit" disabled={isPending || !email || !password}>
            <KeyRound data-icon="inline-start" />
            {isPending ? "Signing in…" : "Sign in"}
          </Button>
        </FieldGroup>
      </form>
      <p className="mt-4 text-sm text-muted-foreground">New here? Ask an administrator for an invite link.</p>
    </AuthPageShell>
  );
}

/** Centered layout shared by the sign-in and invite pages. */
export function AuthPageShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">C</span>
          CMS
        </Link>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        <div className="mt-6 rounded-xl bg-card p-5 ring-1 ring-foreground/10">{children}</div>
      </div>
    </main>
  );
}
