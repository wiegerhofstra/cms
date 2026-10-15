import { z } from "zod";

import { canonicalLocale } from "./locales";

export const maxTenantLocales = 20;

const localeSchema = z.string().trim().min(1).max(35).transform((value, context) => {
  const locale = canonicalLocale(value);
  if (!locale) {
    context.addIssue({ code: "custom", message: `“${value}” is not a valid language code. Use a code such as en, nl or pt-BR.` });
    return z.NEVER;
  }
  return locale;
});

export const localizationSettingsSchema = z
  .object({
    defaultLocale: localeSchema,
    locales: z.array(localeSchema).min(1, "Add at least one language").max(maxTenantLocales, `Use at most ${maxTenantLocales} languages`),
  })
  .refine((value) => new Set(value.locales).size === value.locales.length, { message: "Each language can only be added once", path: ["locales"] })
  .refine((value) => value.locales.includes(value.defaultLocale), { message: "The default language must be one of the languages", path: ["defaultLocale"] });

export type LocalizationSettings = z.infer<typeof localizationSettingsSchema>;
