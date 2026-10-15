"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages, Loader2, Plus, Save, Trash2 } from "lucide-react";
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
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TenantLocalization, TenantSummary } from "@/lib/cms/types";
import { saveLocalizationSettingsAction } from "@/modules/localization/actions";
import { canonicalLocale, localeLabel } from "@/modules/localization/locales";
import { maxTenantLocales } from "@/modules/localization/validation";

const suggestedLocales = ["en", "nl", "de", "fr", "es", "it", "pt", "pl", "sv", "da", "nb", "fi", "cs", "tr", "uk", "ar", "zh", "ja"];

export function LocalizationSettingsPanel({ tenants, tenant, settings }: {
  tenants: TenantSummary[]; tenant: TenantSummary | null; settings: TenantLocalization | null;
}) {
  const router = useRouter();
  const [navigating, navigate] = useTransition();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(settings);
  const [locales, setLocales] = useState(settings?.locales ?? []);
  const [defaultLocale, setDefaultLocale] = useState(settings?.defaultLocale ?? "");
  const [newLocale, setNewLocale] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = pending || navigating;

  const candidate = canonicalLocale(newLocale);
  const addError = !newLocale.trim() ? null
    : !candidate ? "Use a language code such as en, nl or pt-BR."
      : locales.includes(candidate) ? `${localeLabel(candidate)} is already added.`
        : locales.length >= maxTenantLocales ? `Use at most ${maxTenantLocales} languages.` : null;
  const removedLocales = saved ? saved.locales.filter((locale) => !locales.includes(locale)) : [];
  const defaultChanged = Boolean(saved && saved.defaultLocale !== defaultLocale);
  const isDirty = Boolean(saved && (defaultChanged || saved.locales.join(",") !== locales.join(",")));

  function addLocale() {
    if (!candidate || addError) return;
    setLocales([...locales, candidate]);
    setNewLocale("");
  }

  function save() {
    if (!tenant) return;
    setConfirmOpen(false);
    setError(null);
    startTransition(async () => {
      const result = await saveLocalizationSettingsAction(tenant.id, { defaultLocale, locales });
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      setSaved(result.data);
      toast.success("Language settings saved");
    });
  }

  return <div className="grid gap-6">
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Languages /> Languages</CardTitle>
        <CardDescription>Choose the languages content can be written in, separately for each tenant.</CardDescription>
      </CardHeader>
      <CardContent>
        <Field className="max-w-md">
          <FieldLabel htmlFor="localization-tenant">Tenant</FieldLabel>
          <Select value={tenant?.id ?? ""} disabled={busy || !tenants.length} onValueChange={(id) => navigate(() => router.push(`/app/settings/languages?tenant=${id}`))}>
            <SelectTrigger id="localization-tenant" className="w-full"><SelectValue placeholder="Select a tenant" /></SelectTrigger>
            <SelectContent>{tenants.map((item) => <SelectItem key={item.id} value={item.id}>{item.name} · {item.slug}</SelectItem>)}</SelectContent>
          </Select>
          {!tenants.length ? <FieldDescription>Create a tenant in Settings → Tenants to configure languages.</FieldDescription> : null}
        </Field>
      </CardContent>
    </Card>
    {tenant && saved ? <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>Content languages</CardTitle><Badge variant="secondary">{saved.locales.length} {saved.locales.length === 1 ? "language" : "languages"}</Badge></div>
        <CardDescription>
          Content is written in the default language first. With more than one language, fields in {tenant.name} can be marked as translatable in the model.
          The API returns the default value wherever a translation is missing.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <fieldset disabled={busy} className="min-w-0 max-w-2xl">
          <FieldGroup>
            <ul className="divide-y rounded-lg border">
              {locales.map((locale) => {
                const isDefault = locale === defaultLocale;
                return <li key={locale} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{localeLabel(locale)}</p>
                    <p className="font-mono text-xs text-muted-foreground">{locale}</p>
                  </div>
                  {isDefault ? <Badge>Default</Badge> : <Button type="button" size="sm" variant="ghost" onClick={() => setDefaultLocale(locale)}>Make default</Button>}
                  <Button type="button" size="icon-sm" variant="ghost" disabled={isDefault} title={isDefault ? "Choose another default language first" : undefined} aria-label={`Remove ${localeLabel(locale)}`} onClick={() => setLocales(locales.filter((item) => item !== locale))}>
                    <Trash2 />
                  </Button>
                </li>;
              })}
            </ul>
            <Field data-invalid={Boolean(addError) || undefined}>
              <FieldLabel htmlFor="localization-new-locale">Add a language</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="localization-new-locale"
                  list="localization-suggestions"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={35}
                  placeholder="Language code, e.g. nl"
                  aria-invalid={Boolean(addError) || undefined}
                  value={newLocale}
                  onChange={(event) => setNewLocale(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addLocale(); } }}
                />
                <datalist id="localization-suggestions">
                  {suggestedLocales.filter((locale) => !locales.includes(locale)).map((locale) => <option key={locale} value={locale}>{localeLabel(locale)}</option>)}
                </datalist>
                <Button type="button" variant="outline" disabled={!candidate || Boolean(addError)} onClick={addLocale}><Plus data-icon="inline-start" /> Add</Button>
              </div>
              <FieldDescription className={addError ? "text-destructive" : undefined}>
                {addError ?? (candidate ? `Adds ${localeLabel(candidate)}.` : "Use a language code, optionally with a region, such as en, nl or pt-BR.")}
              </FieldDescription>
            </Field>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            <Button type="button" disabled={busy || !isDirty} className="justify-self-start" onClick={() => (removedLocales.length || defaultChanged ? setConfirmOpen(true) : save())}>
              {pending ? <Loader2 className="animate-spin" /> : <Save />} Save languages
            </Button>
          </FieldGroup>
        </fieldset>
      </CardContent>
    </Card> : null}
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Save language changes?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="flex flex-col gap-2">
              {defaultChanged && saved ? <p>
                {localeLabel(defaultLocale)} becomes the default language. Existing content keeps its language: current default values are kept as the {localeLabel(saved.defaultLocale)} translation,
                and {localeLabel(defaultLocale)} translations become the default values.
              </p> : null}
              {removedLocales.length ? <p>Translations in {removedLocales.map((locale) => localeLabel(locale)).join(", ")} will be deleted from all entries. This cannot be undone.</p> : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant={removedLocales.length ? "destructive" : "default"} onClick={save}>Save languages</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
