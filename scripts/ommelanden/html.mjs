import { parseFragment } from "parse5";

export function plainText(node) {
  if (typeof node === "string") return node;
  return (node?.text ?? "") + (node?.content ?? []).map(plainText).join("");
}

const normalized = (text) => text.replace(/\s+/gu, "");
const paragraph = (content = []) => ({ type: "paragraph", ...(content.length ? { content } : {}) });
const inlineTypes = new Set(["text", "hardBreak"]);
const attrs = (node) => Object.fromEntries((node.attrs ?? []).map((attr) => [attr.name, attr.value]));
const sourceText = (node) => node.nodeName === "#text" ? node.value : (node.childNodes ?? []).map(sourceText).join("");

function blockContent(nodes) {
  const blocks = [];
  let inline = [];
  const flush = () => {
    if (inline.some((n) => n.type !== "text" || n.text.trim())) blocks.push(paragraph(inline));
    inline = [];
  };
  for (const node of nodes) {
    if (inlineTypes.has(node.type)) inline.push(node);
    else { flush(); blocks.push(node); }
  }
  flush();
  return blocks;
}

function convert(node, marks = []) {
  if (node.nodeName === "#comment") return [];
  if (node.nodeName === "#text") {
    const text = node.value.replace(/[\t\r\n ]+/g, " ");
    return text ? [{ type: "text", text, ...(marks.length ? { marks } : {}) }] : [];
  }
  const tag = node.tagName;
  const attributes = attrs(node);
  const children = (nextMarks = marks) => (node.childNodes ?? []).flatMap((child) => convert(child, nextMarks));
  if (["strong", "b", "em", "i", "s", "strike", "u", "code"].includes(tag)) {
    const type = { strong: "bold", b: "bold", em: "italic", i: "italic", s: "strike", strike: "strike", u: "underline", code: "code" }[tag];
    return children([...marks.filter((m) => m.type !== type), { type }]);
  }
  if (tag === "a") {
    const href = attributes.href ?? "";
    if (!href || (!/^(https?:|mailto:|tel:|\/|#)/i.test(href))) throw new Error(`Unsupported link protocol: ${href}`);
    return children([...marks.filter((m) => m.type !== "link"), { type: "link", attrs: {
      href, target: attributes.target ?? null, rel: attributes.rel ?? "noopener noreferrer nofollow",
    } }]);
  }
  if (tag === "br") return [{ type: "hardBreak" }];
  if (tag === "hr") return [{ type: "horizontalRule" }];
  if (tag === "p") return [paragraph(children())];
  if (/^h[1-6]$/.test(tag)) return [{ type: "heading", attrs: { level: Number(tag[1]) }, content: children() }];
  if (tag === "ul" || tag === "ol") return [{ type: tag === "ul" ? "bulletList" : "orderedList",
    ...(tag === "ol" ? { attrs: { start: Number(attributes.start ?? 1) } } : {}),
    content: children().filter((n) => n.type !== "text" || n.text.trim()),
  }];
  if (tag === "li") return [{ type: "listItem", content: blockContent(children()).length ? blockContent(children()) : [paragraph()] }];
  if (tag === "blockquote") return [{ type: "blockquote", content: blockContent(children()) }];
  if (tag === "pre") return [{ type: "codeBlock", content: [{ type: "text", text: sourceText(node) }] }];
  if (tag === "table" || tag === "tr") return [{ type: tag === "table" ? "table" : "tableRow",
    content: children().filter((n) => n.type !== "text" || n.text.trim()),
  }];
  if (tag === "td" || tag === "th") return [{ type: tag === "td" ? "tableCell" : "tableHeader", attrs: {
    colspan: Number(attributes.colspan ?? 1), rowspan: Number(attributes.rowspan ?? 1), colwidth: null,
  }, content: blockContent(children()).length ? blockContent(children()) : [paragraph()] }];
  if (!tag || ["tbody", "thead", "tfoot", "div", "span"].includes(tag)) return children();
  // Fail rather than silently dropping content such as images, embeds or scripts.
  throw new Error(`Unsupported HTML element: ${tag}`);
}

export function toRichText(value) {
  const html = value ?? "";
  if (!/<[a-z][\s\S]*>/i.test(html)) {
    return { type: "doc", content: html ? html.split(/\r?\n\s*\r?\n/).map((block) => paragraph(
      block.split(/\r?\n/).flatMap((line, i) => [...(i ? [{ type: "hardBreak" }] : []), ...(line ? [{ type: "text", text: line }] : [])]),
    )) : [paragraph()] };
  }
  const fragment = parseFragment(html);
  const blocks = blockContent(convert(fragment));
  const document = { type: "doc", content: blocks.length ? blocks : [paragraph()] };
  if (normalized(sourceText(fragment)) !== normalized(plainText(document))) {
    throw new Error("HTML conversion changed visible text");
  }
  return document;
}
