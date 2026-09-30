"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, Plug, Save, Send } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { TenantSummary } from "@/lib/cms/types";
import { saveEmailSettingsAction, sendTenantTestEmailAction, verifyTenantEmailAction } from "@/modules/email/actions";
import type { EmailSettingsSummary } from "@/modules/email/validation";

export function EmailSettingsPanel({ tenants, tenant, settings, credentialsReady }: {
  tenants: TenantSummary[]; tenant: TenantSummary | null; settings: EmailSettingsSummary | null; credentialsReady: boolean;
}) {
  const router = useRouter();
  const [navigating, navigate] = useTransition();
  const [pending, startTransition] = useTransition();
  const [operation, setOperation] = useState("");
  const [saved, setSaved] = useState(settings);
  const [enabled, setEnabled] = useState(settings?.enabled ?? false);
  const [encryption, setEncryption] = useState<"starttls" | "tls">(settings?.encryption ?? "starttls");
  const [port, setPort] = useState(String(settings?.port ?? 587));
  const [dirty, setDirty] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const busy = pending || navigating;

  function run(name: string, action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setOperation(name);
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) throw new Error(result.error ?? "The email operation failed");
        setFeedback({ error: false, text: success });
        toast.success(success);
      } catch (error) {
        const text = error instanceof Error ? error.message : "The email operation failed";
        setFeedback({ error: true, text });
        toast.error(text);
      }
    });
  }

  return <div className="grid gap-6">
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Mail /> Email</CardTitle>
        <CardDescription>Configure outgoing email separately for each tenant.</CardDescription>
      </CardHeader>
      <CardContent>
        <Field className="max-w-md">
          <FieldLabel htmlFor="email-tenant">Tenant</FieldLabel>
          <Select value={tenant?.id ?? ""} disabled={busy || !tenants.length} onValueChange={(id) => navigate(() => router.push(`/app/settings/email?tenant=${id}`))}>
            <SelectTrigger id="email-tenant" className="w-full"><SelectValue placeholder="Select a tenant" /></SelectTrigger>
            <SelectContent>{tenants.map((item) => <SelectItem key={item.id} value={item.id}>{item.name} · {item.slug}</SelectItem>)}</SelectContent>
          </Select>
          {!tenants.length ? <FieldDescription>Create a tenant in Settings → Tenants to configure email.</FieldDescription> : null}
        </Field>
      </CardContent>
    </Card>
    {tenant ? <>
      {!credentialsReady ? <p role="alert" className="rounded-xl border p-4 text-sm">Email credential storage needs a server encryption key. Set EMAIL_ENCRYPTION_KEY before saving SMTP credentials. See the email setup guide in the repository.</p> : null}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>SMTP settings</CardTitle><Badge variant={saved?.enabled ? "default" : "secondary"}>{saved?.enabled ? "Enabled" : "Disabled"}</Badge></div>
            <CardDescription>Settings for {tenant.name}. Save changes before testing.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onChange={() => { setDirty(true); setFeedback(null); }} onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const value = (name: string) => String(form.get(name) ?? "");
              run("save", async () => {
                const result = await saveEmailSettingsAction(tenant.id, {
                  enabled, host: value("host"), port: Number(port), encryption,
                  username: value("username"), password: value("password"),
                  fromEmail: value("fromEmail"), fromName: value("fromName"),
                  allowedFrom: value("allowedFrom").split(/[\n,]/).map((address) => address.trim()).filter(Boolean),
                  servername: value("servername"),
                });
                if (result.ok) {
                  setSaved(result.data); setDirty(false);
                  if (passwordRef.current) passwordRef.current.value = "";
                }
                return result;
              }, "Email settings saved");
            }}>
              <fieldset disabled={busy} className="min-w-0">
                <FieldGroup>
                  <Field orientation="horizontal">
                    <Switch id="email-enabled" checked={enabled} onCheckedChange={(value) => { setEnabled(value); setDirty(true); }} />
                    <div><FieldLabel htmlFor="email-enabled">Enable email sending</FieldLabel><FieldDescription>Allow authorized API tokens to send email for this tenant.</FieldDescription></div>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="email-host">SMTP host</FieldLabel>
                    <Input id="email-host" name="host" required maxLength={253} defaultValue={settings?.host} placeholder="smtp.example.com" autoComplete="off" />
                  </Field>
                  <div className="grid gap-5 sm:grid-cols-[1fr_8rem]">
                    <Field>
                      <FieldLabel htmlFor="email-encryption">Encryption</FieldLabel>
                      <Select value={encryption} disabled={busy} onValueChange={(value: "starttls" | "tls") => { setEncryption(value); setPort(value === "tls" ? "465" : "587"); setDirty(true); }}>
                        <SelectTrigger id="email-encryption" className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="starttls">STARTTLS (required)</SelectItem><SelectItem value="tls">TLS</SelectItem></SelectContent>
                      </Select>
                    </Field>
                    <Field><FieldLabel htmlFor="email-port">Port</FieldLabel><Input id="email-port" type="number" min={1} max={65535} required value={port} onChange={(event) => setPort(event.target.value)} /></Field>
                  </div>
                  <Field><FieldLabel htmlFor="email-username">Username</FieldLabel><Input id="email-username" name="username" required maxLength={320} autoComplete="off" defaultValue={settings?.username} /></Field>
                  <Field>
                    <FieldLabel htmlFor="email-password">Password</FieldLabel>
                    <Input ref={passwordRef} id="email-password" name="password" type="password" required={!saved?.hasPassword} maxLength={4096} autoComplete="new-password" placeholder={saved?.hasPassword ? "Password saved" : "SMTP password"} />
                    <FieldDescription>{saved?.hasPassword ? "Leave blank to keep the saved password. Enter a new value to replace it." : "Encrypted when saved. Use your provider’s SMTP or app password."}</FieldDescription>
                  </Field>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field><FieldLabel htmlFor="email-from">Default sender email</FieldLabel><Input id="email-from" name="fromEmail" type="email" required maxLength={254} defaultValue={settings?.fromEmail} placeholder="website@example.com" /></Field>
                    <Field><FieldLabel htmlFor="email-name">Sender display name</FieldLabel><Input id="email-name" name="fromName" maxLength={120} defaultValue={settings?.fromName} placeholder={tenant.name} /></Field>
                  </div>
                  <details className="rounded-lg border p-4">
                    <summary className="cursor-pointer text-sm font-medium">Advanced settings</summary>
                    <div className="mt-4 grid gap-5">
                      <Field>
                        <FieldLabel htmlFor="email-allowed">Additional allowed senders</FieldLabel>
                        <Textarea id="email-allowed" name="allowedFrom" defaultValue={settings?.allowedFrom.join("\n")} placeholder="support@example.com" />
                        <FieldDescription>One email address per line, up to 20. The default sender is always allowed. Use addresses authorized by your email provider.</FieldDescription>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="email-servername">TLS server name</FieldLabel>
                        <Input id="email-servername" name="servername" maxLength={253} defaultValue={settings?.servername} placeholder="smtp.example.com" />
                        <FieldDescription>Usually blank. Required for certificate verification when the host is an IP address.</FieldDescription>
                      </Field>
                    </div>
                  </details>
                  <Button type="submit" disabled={busy || !credentialsReady} className="justify-self-start">{pending && operation === "save" ? <Loader2 className="animate-spin" /> : <Save />} Save settings</Button>
                </FieldGroup>
              </fieldset>
            </form>
          </CardContent>
        </Card>
        <div className="grid gap-6">
          <Card>
            <CardHeader><CardTitle>Test configuration</CardTitle><CardDescription>Tests use the saved settings for {tenant.name}.</CardDescription></CardHeader>
            <CardContent className="grid gap-4">
              <Button variant="outline" disabled={busy || dirty || !saved || !credentialsReady} onClick={() => run("verify", () => verifyTenantEmailAction(tenant.id), "SMTP connection and authentication verified")}>
                {pending && operation === "verify" ? <Loader2 className="animate-spin" /> : <Plug />} Test connection
              </Button>
              <p className="text-xs text-muted-foreground">Checks connectivity and authentication without sending a message.</p>
              <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); run("test", () => sendTenantTestEmailAction(tenant.id, recipient), "Test email accepted by the SMTP server"); }}>
                <Field><FieldLabel htmlFor="email-test-to">Test recipient</FieldLabel><Input id="email-test-to" type="email" required value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="you@example.com" /></Field>
                <Button type="submit" disabled={busy || dirty || !saved?.enabled || !credentialsReady || !recipient.trim()}>
                  {pending && operation === "test" ? <Loader2 className="animate-spin" /> : <Send />} Send test email
                </Button>
              </form>
              {dirty ? <p className="text-xs text-muted-foreground">Save your changes before testing.</p> : !saved?.enabled ? <p className="text-xs text-muted-foreground">Enable and save email sending to send a test message.</p> : null}
              {feedback ? <p role={feedback.error ? "alert" : "status"} className={`text-sm ${feedback.error ? "text-destructive" : "text-muted-foreground"}`}>{feedback.text}</p> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Send through the API</CardTitle><CardDescription>Use a token for {tenant.name} with the email:send permission.</CardDescription></CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <code className="break-all rounded-lg bg-muted p-3">POST /api/email/{tenant.slug}/send</code>
              <p className="text-muted-foreground">Requires to, subject and text. Optional: from, replyTo and html. Omitting from uses the default sender.</p>
              <p className="text-muted-foreground">30 attempts per minute per tenant, including tests. An accepted response confirms SMTP submission.</p>
              <Link href="/app/settings/auth" className="underline underline-offset-4">Manage API tokens</Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </> : null}
  </div>;
}
