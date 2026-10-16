import Link from "@tiptap/extension-link";
import { mergeAttributes } from "@tiptap/core";

/** Keep reference identity through JSON and HTML clipboard round trips. URLs are resolved by delivery. */
export const RichTextLinkExtension = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      kind: { default: "url", parseHTML: (element) => element.getAttribute("data-link-kind") || "url", renderHTML: (attrs) => ({ "data-link-kind": attrs.kind }) },
      entryId: { default: null, parseHTML: (element) => element.getAttribute("data-entry-id"), renderHTML: (attrs) => attrs.entryId ? { "data-entry-id": attrs.entryId } : {} },
      assetId: { default: null, parseHTML: (element) => element.getAttribute("data-asset-id"), renderHTML: (attrs) => attrs.assetId ? { "data-asset-id": attrs.assetId } : {} },
    };
  },
  renderHTML({ mark, HTMLAttributes }) {
    const reference = HTMLAttributes["data-link-kind"] === "page" || HTMLAttributes["data-link-kind"] === "asset";
    if (reference) return ["a", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { href: "#", title: HTMLAttributes["data-link-kind"] === "page" ? "Linked page" : "Linked asset" }), 0];
    return this.parent?.({ mark, HTMLAttributes }) ?? ["a", HTMLAttributes, 0];
  },
});
