import type { EntryTranslations } from "../../db/schema/content.ts";
import { isEmptyRichTextDocument } from "../../lib/rich-text.ts";

export type { EntryTranslations };
export type TenantLocalization = { defaultLocale: string; locales: string[] };
type LocalizableField = { key: string; type: string; localized: boolean };

export const defaultLocalization: TenantLocalization = { defaultLocale: "en", locales: ["en"] };

/** Field types whose value can differ per language. Structural types (components) and plain values (numbers, dates, …) are shared. */
export const localizableFieldTypes = ["text", "rich_text", "url", "slug", "asset"] as const;

export function isLocalizableFieldType(type: string): boolean {
  return (localizableFieldTypes as readonly string[]).includes(type);
}

export function isLocalizedField(field: LocalizableField): boolean {
  return field.localized && isLocalizableFieldType(field.type);
}

/** Canonical BCP 47 tag (e.g. "en-us" → "en-US"), or null when the code is not a valid language tag. */
export function canonicalLocale(code: string): string | null {
  try {
    const [locale] = Intl.getCanonicalLocales(code.trim());
    return locale && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(locale) ? locale : null;
  } catch {
    return null;
  }
}

export function localeLabel(code: string, displayLocale = "en"): string {
  try {
    const label = new Intl.DisplayNames([displayLocale], { type: "language", fallback: "none" }).of(code);
    return label && label !== code ? label : code;
  } catch {
    return code;
  }
}

/** A translation that is "empty" does not count as a translation, so the default value shows through. */
export function isEmptyLocalizedValue(value: unknown): boolean {
  return isEmptyRichTextDocument(value) || (Array.isArray(value) && value.length === 0);
}

/**
 * Entry data as seen in one locale: localized fields use the translation when one exists and fall back to the
 * default-locale value stored in `data` otherwise. Non-localized fields are always shared.
 */
export function localizeEntryData(
  fields: LocalizableField[],
  data: Record<string, unknown>,
  translations: EntryTranslations | null | undefined,
  locale: string,
  localization: TenantLocalization,
): Record<string, unknown> {
  const localeValues = locale === localization.defaultLocale ? undefined : translations?.[locale];
  if (!localeValues) return data;

  const localized = { ...data };
  for (const field of fields) {
    if (!isLocalizedField(field)) continue;
    const value = localeValues[field.key];
    if (!isEmptyLocalizedValue(value)) localized[field.key] = value;
  }
  return localized;
}

/** Keeps only non-empty values of localized fields in the tenant's additional (non-default) locales. */
export function sanitizeTranslations(
  fields: LocalizableField[],
  translations: unknown,
  localization: TenantLocalization,
): EntryTranslations {
  if (!isRecord(translations)) return {};
  const localizedKeys = fields.filter(isLocalizedField).map((field) => field.key);
  const sanitized: EntryTranslations = {};

  for (const locale of localization.locales) {
    if (locale === localization.defaultLocale) continue;
    const values = translations[locale];
    if (!isRecord(values)) continue;

    const kept = Object.fromEntries(localizedKeys.flatMap((key) => (isEmptyLocalizedValue(values[key]) ? [] : [[key, values[key]] as const])));
    if (Object.keys(kept).length) sanitized[locale] = kept;
  }
  return sanitized;
}

/**
 * Moves content when the default locale changes so every locale keeps showing the same values:
 * the new default's translations become the stored data, and the old default's data becomes its translation.
 * Translations for locales that are no longer configured are dropped.
 */
export function rebaseEntryLocalization(
  localizedKeys: string[],
  entry: { data: Record<string, unknown>; translations: EntryTranslations },
  previous: TenantLocalization,
  next: TenantLocalization,
): { data: Record<string, unknown>; translations: EntryTranslations } {
  const data = { ...entry.data };
  const translations: EntryTranslations = Object.fromEntries(
    Object.entries(entry.translations ?? {}).map(([locale, values]) => [locale, { ...values }]),
  );

  if (previous.defaultLocale !== next.defaultLocale) {
    const promoted = translations[next.defaultLocale] ?? {};
    const demoted: Record<string, unknown> = {};
    for (const key of localizedKeys) {
      if (!isEmptyLocalizedValue(data[key])) demoted[key] = data[key];
      // Without a translation the new default already showed the old default's value, so the data stays as is.
      if (!isEmptyLocalizedValue(promoted[key])) data[key] = promoted[key];
    }
    delete translations[next.defaultLocale];
    translations[previous.defaultLocale] = demoted;
  }

  for (const locale of Object.keys(translations)) {
    if (!next.locales.includes(locale) || locale === next.defaultLocale || !Object.keys(translations[locale]!).length) delete translations[locale];
  }
  return { data, translations };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
