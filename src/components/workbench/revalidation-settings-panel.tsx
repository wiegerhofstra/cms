"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TenantSummary } from "@/lib/cms/types";
import { saveRevalidationSettingsAction } from "@/modules/revalidation/actions";
import type { RevalidationSettingsSummary } from "@/modules/revalidation/validation";

export function RevalidationSettingsPanel({ tenants, tenant, settings }: {
  tenants: TenantSummary[]; tenant: TenantSummary | null; settings: RevalidationSettingsSummary | null;
}) {
  const router = useRouter();
  const [navigating, navigate] = useTransition();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(settings);
  const [url, setUrl] = useState(settings?.url ?? "");
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef<HTMLInputElement>(null);
  const busy = pending || navigating;

  return <div className="grid gap-6">
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><RefreshCw /> Revalidation</CardTitle>
        <CardDescription>Configure website revalidation separately for each tenant.</CardDescription>
      </CardHeader>
      <CardContent>
        <Field className="max-w-md">
          <FieldLabel htmlFor="revalidation-tenant">Tenant</FieldLabel>
          <Select value={tenant?.id ?? ""} disabled={busy || !tenants.length} onValueChange={(id) => navigate(() => router.push(`/app/settings/revalidation?tenant=${id}`))}>
            <SelectTrigger id="revalidation-tenant" className="w-full"><SelectValue placeholder="Select a tenant" /></SelectTrigger>
            <SelectContent>{tenants.map((item) => <SelectItem key={item.id} value={item.id}>{item.name} · {item.slug}</SelectItem>)}</SelectContent>
          </Select>
          {!tenants.length ? <FieldDescription>Create a tenant in Settings → Tenants to configure revalidation.</FieldDescription> : null}
        </Field>
      </CardContent>
    </Card>
    {tenant ? <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>Revalidation settings</CardTitle><Badge variant={saved ? "default" : "secondary"}>{saved ? "Configured" : "Not configured"}</Badge></div>
        <CardDescription>Save an endpoint and token for {tenant.name} to show the Revalidate button in the header.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setError(null);
          startTransition(async () => {
            try {
              const result = await saveRevalidationSettingsAction(tenant.id, { url, token: String(form.get("token") ?? "") });
              if (!result.ok) throw new Error(result.error);
              setSaved(result.data);
              if (tokenRef.current) tokenRef.current.value = "";
              toast.success(result.data ? "Revalidation settings saved" : "Revalidation disabled");
            } catch (error) {
              const message = error instanceof Error ? error.message : "Revalidation settings could not be saved";
              setError(message);
              toast.error(message);
            }
          });
        }}>
          <fieldset disabled={busy} className="min-w-0 max-w-2xl">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="revalidation-url">Revalidation URL</FieldLabel>
                <Input id="revalidation-url" name="url" type="url" maxLength={2048} value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/api/revalidate" autoComplete="off" />
                <FieldDescription>The full URL of your website’s revalidation endpoint. Clear the URL and save to disable revalidation.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="revalidation-token">Token</FieldLabel>
                <Input ref={tokenRef} id="revalidation-token" name="token" type="password" required={Boolean(url.trim()) && !saved?.hasToken} maxLength={4096} autoComplete="new-password" placeholder={saved?.hasToken ? "Token saved" : "Revalidation token"} />
                <FieldDescription>{saved?.hasToken ? "Leave blank to keep the saved token. Enter a new value to replace it." : "Enter the secret expected by your website. The token is encrypted when saved."}</FieldDescription>
              </Field>
              {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" disabled={busy} className="justify-self-start">{pending ? <Loader2 className="animate-spin" /> : <Save />} Save settings</Button>
            </FieldGroup>
          </fieldset>
        </form>
      </CardContent>
    </Card> : null}
  </div>;
}
