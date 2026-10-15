"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Download, KeyRound, LogOut, RefreshCw, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { encode } from "uqr";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";

type SetupState =
  | { step: "password" }
  | { step: "scan"; totpURI: string; backupCodes: string[] }
  | { step: "backup-codes"; backupCodes: string[] };

/** Walks the user through connecting an authenticator app, then shows their backup codes. */
export function TwoFactorSetup({ required }: { required: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<SetupState>({ step: "password" });

  if (state.step === "password") {
    return (
      <>
        <PasswordStep
          label="Continue"
          description="Confirm your password to start setting up two-factor authentication."
          onConfirm={async (password) => {
            const result = await authClient.twoFactor.enable({ password });
            if (result.error) return result.error.message ?? "Two-factor authentication could not be started";
            if (result.data.method !== "totp") return "Two-factor authentication could not be started";
            setState({ step: "scan", totpURI: result.data.totpURI, backupCodes: result.data.backupCodes });
          }}
        />
        <LeaveLink required={required} />
      </>
    );
  }

  if (state.step === "scan") {
    return (
      <>
        <ScanStep totpURI={state.totpURI} onVerified={() => setState({ step: "backup-codes", backupCodes: state.backupCodes })} />
        <LeaveLink required={required} />
      </>
    );
  }

  return (
    <BackupCodesStep
      backupCodes={state.backupCodes}
      onDone={() => {
        router.push("/app");
        router.refresh();
      }}
    />
  );
}

/** Shown once two-factor authentication is on: new backup codes, and turning it off when the account allows it. */
export function TwoFactorManage({ required }: { required: boolean }) {
  const router = useRouter();
  const [action, setAction] = useState<"regenerate" | "disable" | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  if (backupCodes) {
    return <BackupCodesStep backupCodes={backupCodes} onDone={() => setBackupCodes(null)} />;
  }

  if (action === "regenerate") {
    return (
      <>
        <PasswordStep
          label="Create new backup codes"
          description="Your current backup codes will stop working."
          onConfirm={async (password) => {
            const result = await authClient.twoFactor.generateBackupCodes({ password });
            if (result.error) return result.error.message ?? "Backup codes could not be created";
            setAction(null);
            setBackupCodes(result.data.backupCodes);
          }}
        />
        <CancelButton onClick={() => setAction(null)} />
      </>
    );
  }

  if (action === "disable") {
    return (
      <>
        <PasswordStep
          label="Turn off two-factor authentication"
          description="You’ll only need your password to sign in."
          destructive
          onConfirm={async (password) => {
            const result = await authClient.twoFactor.disable({ password });
            if (result.error) return result.error.message ?? "Two-factor authentication could not be turned off";
            toast.success("Two-factor authentication is off");
            router.refresh();
          }}
        />
        <CancelButton onClick={() => setAction(null)} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="size-4 text-primary" /> Two-factor authentication is on</p>
      {required ? <p className="text-sm text-muted-foreground">Your account requires it, so it can’t be turned off.</p> : null}
      <Button variant="outline" onClick={() => setAction("regenerate")}><RefreshCw data-icon="inline-start" /> Create new backup codes</Button>
      {!required ? (
        <Button variant="outline" onClick={() => setAction("disable")}><ShieldOff data-icon="inline-start" /> Turn off</Button>
      ) : null}
      <Button asChild><Link href="/app">Back to the workbench</Link></Button>
    </div>
  );
}

/** Password confirmation; `onConfirm` returns an error message to show, or nothing on success. */
function PasswordStep({
  label,
  description,
  destructive = false,
  onConfirm,
}: {
  label: string;
  description: string;
  destructive?: boolean;
  onConfirm: (password: string) => Promise<string | void>;
}) {
  const [isPending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function confirm() {
    setError("");
    startTransition(async () => {
      const message = await onConfirm(password);
      if (message) setError(message);
    });
  }

  return (
    <form onSubmit={(event) => { event.preventDefault(); confirm(); }}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="two-factor-password">Password</FieldLabel>
          <Input id="two-factor-password" type="password" autoComplete="current-password" autoFocus value={password} onChange={(event) => setPassword(event.target.value)} />
          <FieldDescription>{description}</FieldDescription>
        </Field>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={isPending || !password}>
          <KeyRound data-icon="inline-start" />
          {isPending ? "Checking…" : label}
        </Button>
      </FieldGroup>
    </form>
  );
}

function ScanStep({ totpURI, onVerified }: { totpURI: string; onVerified: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const secret = useMemo(() => new URL(totpURI).searchParams.get("secret") ?? "", [totpURI]);

  function verify() {
    setError("");
    startTransition(async () => {
      // With a signed-in session this confirms the app is connected and turns two-factor authentication on.
      const result = await authClient.twoFactor.verifyTotp({ code });
      if (result.error) {
        setError(result.error.message ?? "That code didn’t work. Check the time on your phone and try again.");
        setCode("");
        return;
      }
      onVerified();
    });
  }

  return (
    <form onSubmit={(event) => { event.preventDefault(); verify(); }}>
      <FieldGroup>
        <div className="flex flex-col gap-3">
          <p className="text-sm">Scan this code with an authenticator app, such as 1Password, Google Authenticator, or Microsoft Authenticator.</p>
          <QrCode value={totpURI} className="mx-auto size-48 rounded-lg" />
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Can’t scan the code?</summary>
            <p className="mt-2 text-muted-foreground">Enter this setup key in your app instead:</p>
            <code className="mt-1 block rounded-md bg-muted px-3 py-2 font-mono text-sm break-all select-all">{secret.match(/.{1,4}/g)?.join(" ")}</code>
          </details>
        </div>
        <Field>
          <FieldLabel htmlFor="two-factor-code">6-digit code from the app</FieldLabel>
          <Input
            id="two-factor-code"
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
            className="font-mono tracking-widest"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          />
        </Field>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={isPending || code.length !== 6}>
          <ShieldCheck data-icon="inline-start" />
          {isPending ? "Verifying…" : "Turn on two-factor authentication"}
        </Button>
      </FieldGroup>
    </form>
  );
}

function BackupCodesStep({ backupCodes, onDone }: { backupCodes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const text = backupCodes.join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Backup codes copied");
    } catch {
      toast.error("Copy failed. Select the codes and copy them manually.");
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([`CMS backup codes\n\n${text}\n`], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "cms-backup-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-medium">Save your backup codes</p>
        <p className="mt-1 text-sm text-muted-foreground">
          If you lose your phone, sign in with one of these codes. Each works once. Keep them somewhere safe, such as a password manager. They won’t be shown again.
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md bg-muted px-4 py-3 font-mono text-sm select-all">
        {backupCodes.map((code) => <li key={code}>{code}</li>)}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={copy}><Copy data-icon="inline-start" /> Copy</Button>
        <Button type="button" variant="outline" onClick={download}><Download data-icon="inline-start" /> Download</Button>
      </div>
      <Field orientation="horizontal">
        <Checkbox id="backup-codes-saved" checked={saved} onCheckedChange={(checked) => setSaved(checked === true)} />
        <FieldLabel htmlFor="backup-codes-saved" className="font-normal">I’ve saved my backup codes</FieldLabel>
      </Field>
      <Button disabled={!saved} onClick={onDone}>Done</Button>
    </div>
  );
}

/** Dark modules on a light background regardless of theme, so every scanner can read it. */
function QrCode({ value, className }: { value: string; className?: string }) {
  const { data, size } = useMemo(() => encode(value, { border: 2 }), [value]);
  const path = useMemo(
    () => data.flatMap((row, y) => row.flatMap((dark, x) => (dark ? [`M${x} ${y}h1v1h-1z`] : []))).join(""),
    [data],
  );

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={className} role="img" aria-label="QR code for your authenticator app" shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}

function LeaveLink({ required }: { required: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (!required) {
    return (
      <Button asChild variant="ghost" className="mt-2 w-full"><Link href="/app">Not now</Link></Button>
    );
  }

  return (
    <Button
      variant="ghost"
      className="mt-2 w-full"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await authClient.signOut();
          router.replace("/login");
        })
      }
    >
      <LogOut data-icon="inline-start" /> Sign out
    </Button>
  );
}

function CancelButton({ onClick }: { onClick: () => void }) {
  return <Button variant="ghost" className="mt-2 w-full" onClick={onClick}>Cancel</Button>;
}
