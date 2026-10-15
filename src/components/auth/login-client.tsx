"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";

export function LoginClient() {
  return (
    <AuthPageShell title="Sign in" description="Use the email address and password for your account.">
      <LoginForm />
    </AuthPageShell>
  );
}

/** Email and password form, followed by a code prompt for accounts with two-factor authentication; on success it opens the workbench. */
export function LoginForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [needsCode, setNeedsCode] = useState(false);

  function openWorkbench() {
    toast.success("Signed in");
    router.push("/app");
    router.refresh();
  }

  function signIn() {
    startTransition(async () => {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        toast.error(result.error.message ?? "Sign in failed");
        return;
      }
      if ("twoFactorRedirect" in result.data && result.data.twoFactorRedirect) {
        setNeedsCode(true);
        return;
      }
      openWorkbench();
    });
  }

  if (needsCode) {
    return (
      <TwoFactorCodeForm
        onVerified={openWorkbench}
        onCancel={() => {
          setNeedsCode(false);
          setPassword("");
        }}
      />
    );
  }

  return (
    <>
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
    </>
  );
}

/** Second sign-in step: a code from the authenticator app, or one of the saved backup codes. */
function TwoFactorCodeForm({ onVerified, onCancel }: { onVerified: () => void; onCancel: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [code, setCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);
  const trimmedCode = code.trim();

  function verify() {
    startTransition(async () => {
      const result = useBackupCode
        ? await authClient.twoFactor.verifyBackupCode({ code: trimmedCode, trustDevice })
        : await authClient.twoFactor.verifyTotp({ code: trimmedCode, trustDevice });
      if (result.error) {
        toast.error(result.error.message ?? "That code didn’t work");
        setCode("");
        return;
      }
      onVerified();
    });
  }

  return (
    <form onSubmit={(event) => { event.preventDefault(); verify(); }}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="signin-code">{useBackupCode ? "Backup code" : "Authentication code"}</FieldLabel>
          <Input
            key={useBackupCode ? "backup" : "totp"}
            id="signin-code"
            autoFocus
            autoComplete="one-time-code"
            inputMode={useBackupCode ? "text" : "numeric"}
            maxLength={useBackupCode ? 32 : 6}
            className="font-mono tracking-widest"
            value={code}
            onChange={(event) => setCode(useBackupCode ? event.target.value : event.target.value.replace(/\D/g, ""))}
          />
          <FieldDescription>
            {useBackupCode ? "Enter one of the backup codes you saved. Each code works once." : "Enter the 6-digit code from your authenticator app."}
          </FieldDescription>
        </Field>
        <Field orientation="horizontal">
          <Checkbox id="signin-trust-device" checked={trustDevice} onCheckedChange={(checked) => setTrustDevice(checked === true)} />
          <FieldLabel htmlFor="signin-trust-device" className="font-normal">Don’t ask again on this device for 30 days</FieldLabel>
        </Field>
        <Button type="submit" disabled={isPending || (useBackupCode ? !trimmedCode : trimmedCode.length !== 6)}>
          <ShieldCheck data-icon="inline-start" />
          {isPending ? "Verifying…" : "Verify"}
        </Button>
      </FieldGroup>
      <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm">
        <button
          type="button"
          className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          onClick={() => {
            setUseBackupCode(!useBackupCode);
            setCode("");
          }}
        >
          {useBackupCode ? "Use authenticator app" : "Use a backup code"}
        </button>
        <button type="button" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" onClick={onCancel}>
          Start over
        </button>
      </div>
    </form>
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
