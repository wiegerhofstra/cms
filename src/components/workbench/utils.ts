import type { ContentEntry, ContentField } from "@/lib/cms/types";
import { createEmptyRichTextDocument, isEmptyRichTextDocument, isRichTextDocument, richTextPlainText } from "@/lib/rich-text";

export function parseJsonObject(value: string): Record<string, unknown> {
  if (!value.trim()) return {};
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Expected a JSON object");
  }
  return parsed as Record<string, unknown>;
}

export function formatJson(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

export function createDefaultEntryData(fields: ContentField[], source: Record<string, unknown> = {}): Record<string, unknown> {
  const data: Record<string, unknown> = { ...source };

  for (const field of fields) {
    if (data[field.key] !== undefined) continue;
    if (field.type === "boolean") data[field.key] = false;
    else if (field.type === "component") data[field.key] = field.isList ? [] : null;
    else if (field.type === "rich_text") data[field.key] = createEmptyRichTextDocument();
    else data[field.key] = "";
  }

  return data;
}

export function normalizeEntryData(fields: ContentField[], data: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...data };

  for (const field of fields) {
    const value = data[field.key];

    if (field.type === "boolean") {
      normalized[field.key] = value === true;
      continue;
    }

    if (isEmptyFieldValue(value)) {
      delete normalized[field.key];
      continue;
    }

    if (field.type === "number") {
      const numberValue = typeof value === "number" ? value : Number(value);
      if (Number.isFinite(numberValue)) normalized[field.key] = numberValue;
      else delete normalized[field.key];
      continue;
    }

    if (field.type === "rich_text") {
      if (isRichTextDocument(value)) normalized[field.key] = value;
      else delete normalized[field.key];
      continue;
    }

    normalized[field.key] = value;
  }

  return normalized;
}

export function hasMissingRequiredFields(fields: ContentField[], data: Record<string, unknown>): boolean {
  return fields.some((field) => field.required && isEmptyFieldValue(data[field.key]));
}

export function isEmptyFieldValue(value: unknown): boolean {
  return isEmptyRichTextDocument(value) || (Array.isArray(value) && value.length === 0);
}

export function getEnumOptions(field: ContentField): Array<{ label: string; value: string }> {
  const options = field.config.options;
  if (!Array.isArray(options)) return [];

  return options.flatMap((option) => {
    if (typeof option === "string" || typeof option === "number") {
      const value = String(option);
      return value ? [{ label: value, value }] : [];
    }

    if (typeof option === "object" && option !== null && "value" in option) {
      const value = String(option.value ?? "");
      const label = "label" in option ? String(option.label ?? value) : value;
      return value ? [{ label, value }] : [];
    }

    return [];
  });
}

export function stringValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

export function numberInputValue(value: unknown): string | number {
  return typeof value === "number" ? value : stringValue(value);
}

export function entryTitle(entry: ContentEntry, titleField: ContentField | null): string {
  if (!titleField) return entry.id;
  return titleValue(entry.data[titleField.key]) || entry.id;
}

export function titleValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(titleValue).filter(Boolean).join(", ");
  if (isRichTextDocument(value)) return richTextPlainText(value).trim();
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}
