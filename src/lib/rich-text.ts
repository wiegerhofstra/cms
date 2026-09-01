export type RichTextFeature = "headings" | "lists" | "links" | "media" | "code" | "quotes";

export type RichTextFeatureConfig = Record<RichTextFeature, boolean>;

export const defaultRichTextFeatures: RichTextFeatureConfig = {
  headings: true,
  lists: true,
  links: true,
  media: true,
  code: true,
  quotes: true,
};

export const emptyRichTextDocument = {
  type: "doc",
  content: [{ type: "paragraph" }],
} as const;

export function createEmptyRichTextDocument(): Record<string, unknown> {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

export function richTextFeaturesFromConfig(config: Record<string, unknown> | undefined): RichTextFeatureConfig {
  const richText = config?.richText;
  if (!richText || typeof richText !== "object" || Array.isArray(richText)) return defaultRichTextFeatures;

  return {
    headings: readFeature(richText, "headings"),
    lists: readFeature(richText, "lists"),
    links: readFeature(richText, "links"),
    media: readFeature(richText, "media"),
    code: readFeature(richText, "code"),
    quotes: readFeature(richText, "quotes"),
  };
}

export function withRichTextFeatures(config: Record<string, unknown>, features: RichTextFeatureConfig): Record<string, unknown> {
  return { ...config, richText: features };
}

export function isRichTextDocument(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "type" in value && value.type === "doc";
}

export function isEmptyRichTextDocument(value: unknown): boolean {
  if (!isRichTextDocument(value)) return value === undefined || value === null || value === "";
  return richTextPlainText(value).trim() === "" && !hasAssetNode(value);
}

export function richTextPlainText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (!value || typeof value !== "object") return "";

  const node = value as { text?: unknown; content?: unknown };
  const text = typeof node.text === "string" ? node.text : "";
  const children = Array.isArray(node.content) ? node.content.map(richTextPlainText).filter(Boolean).join(" ") : "";
  return [text, children].filter(Boolean).join(" ");
}

function readFeature(config: object, key: RichTextFeature): boolean {
  return key in config ? (config as Record<RichTextFeature, unknown>)[key] !== false : true;
}

function hasAssetNode(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const node = value as { type?: unknown; content?: unknown };
  if (node.type === "asset") return true;
  return Array.isArray(node.content) && node.content.some(hasAssetNode);
}
