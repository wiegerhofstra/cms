import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalLocale, localizeEntryData, rebaseEntryLocalization, sanitizeTranslations } from "./locales.ts";

const localization = { defaultLocale: "en", locales: ["en", "nl", "de"] };
const fields = [
  { key: "title", type: "text", localized: true },
  { key: "body", type: "rich_text", localized: true },
  { key: "price", type: "number", localized: false },
  // Not a translatable type, so the flag is ignored.
  { key: "count", type: "number", localized: true },
];
const emptyDoc = { type: "doc", content: [{ type: "paragraph" }] };
const doc = (text) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

test("translations replace localized fields and fall back to the default value when missing or empty", () => {
  const data = { title: "Hello", body: doc("Body"), price: 10, count: 1 };
  const translations = { nl: { title: "Hallo", body: emptyDoc, price: 99, count: 2 } };

  assert.deepEqual(localizeEntryData(fields, data, translations, "nl", localization), { title: "Hallo", body: doc("Body"), price: 10, count: 1 });
  assert.equal(localizeEntryData(fields, data, translations, "de", localization), data);
  assert.equal(localizeEntryData(fields, data, translations, "en", localization), data);
});

test("a translation can provide a value the default language leaves empty", () => {
  assert.equal(localizeEntryData(fields, { title: "" }, { nl: { title: "Alleen NL" } }, "nl", localization).title, "Alleen NL");
});

test("sanitizing keeps only non-empty localized values in additional configured languages", () => {
  const translations = {
    en: { title: "Default locale is stored in data" },
    nl: { title: "Hallo", body: emptyDoc, price: 5, unknown: "x" },
    de: { title: "" },
    fr: { title: "Not configured" },
    pt: "not an object",
  };
  assert.deepEqual(sanitizeTranslations(fields, translations, localization), { nl: { title: "Hallo" } });
  assert.deepEqual(sanitizeTranslations(fields, null, localization), {});
});

test("changing the default language keeps what every language shows", () => {
  const entry = { data: { title: "Hello", body: doc("Body"), price: 10 }, translations: { nl: { title: "Hallo" }, de: { title: "Hallo DE" } } };
  const next = { defaultLocale: "nl", locales: ["en", "nl", "de"] };
  const rebased = rebaseEntryLocalization(["title", "body"], entry, localization, next);

  assert.deepEqual(rebased.data, { title: "Hallo", body: doc("Body"), price: 10 });
  assert.deepEqual(rebased.translations, { en: { title: "Hello", body: doc("Body") }, de: { title: "Hallo DE" } });
  for (const locale of ["en", "nl", "de"]) {
    assert.deepEqual(
      localizeEntryData(fields, rebased.data, rebased.translations, locale, next),
      localizeEntryData(fields, entry.data, entry.translations, locale, localization),
      locale,
    );
  }
});

test("removing a language drops its translations; renaming the only language keeps the data", () => {
  const entry = { data: { title: "Hello" }, translations: { nl: { title: "Hallo" }, de: { title: "Hallo DE" } } };
  assert.deepEqual(rebaseEntryLocalization(["title"], entry, localization, { defaultLocale: "en", locales: ["en", "nl"] }).translations, { nl: { title: "Hallo" } });
  assert.deepEqual(
    rebaseEntryLocalization(["title"], { data: { title: "Hoi" }, translations: {} }, { defaultLocale: "en", locales: ["en"] }, { defaultLocale: "nl", locales: ["nl"] }),
    { data: { title: "Hoi" }, translations: {} },
  );
});

test("language codes are canonical BCP 47 tags", () => {
  assert.equal(canonicalLocale("NL"), "nl");
  assert.equal(canonicalLocale(" pt-br "), "pt-BR");
  assert.equal(canonicalLocale("not a locale"), null);
  assert.equal(canonicalLocale(""), null);
});
