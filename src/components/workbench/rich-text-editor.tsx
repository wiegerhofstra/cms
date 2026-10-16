"use client";

import { Node, mergeAttributes, type JSONContent } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type NodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { Bold, Code, Heading2, Heading3, ImageIcon, Italic, Link2, List, ListOrdered, Minus, Quote, Redo2, Undo2, Unlink } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AssetWithPreview } from "@/lib/cms/types";
import { cn } from "@/lib/utils";
import { createEmptyRichTextDocument, isRichTextDocument, richTextFeaturesFromConfig, type RichTextFeatureConfig } from "@/lib/rich-text";

import type { RichTextLink } from "@/lib/links";
import { LinkDialog } from "./link-dialog";
import { RichTextLinkExtension } from "./rich-text-link";

type RichTextEditorProps = {
  tenantSlug: string;
  locale: string;
  id: string;
  value: unknown;
  config: Record<string, unknown>;
  assets: AssetWithPreview[];
  onChange: (value: JSONContent) => void;
};

export function RichTextEditor({ tenantSlug, locale, id, value, config, assets, onChange }: RichTextEditorProps) {
  const [linkDialog, setLinkDialog] = useState<{ from: number; to: number; text: string; editing: boolean; initial: RichTextLink } | null>(null);
  const features = richTextFeaturesFromConfig(config);
  const featureKey = Object.values(features).join(":");
  const readyAssets = assets.filter((asset) => asset.status === "ready");
  // The parent passes a fresh assets array on every render; keying on ids keeps the editor (and its focus) alive while typing.
  const assetKey = readyAssets.map((asset) => asset.id).join(":");
  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: extensionsFor(features, readyAssets),
      content: richTextContent(value),
      editorProps: {
        attributes: {
          id,
          class: cn(
            // Written content is set in the serif so it reads like the published page rather than the interface around it.
            "min-h-52 px-5 py-4 font-serif text-[1.0625rem] leading-[1.7] outline-none [&>*+*]:mt-3",
            "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground",
            "[&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.875em]",
            "[&_h2]:mt-6 [&_h2]:text-2xl [&_h2]:leading-tight [&_h2]:font-semibold [&_h3]:mt-5 [&_h3]:text-xl [&_h3]:leading-snug [&_h3]:font-semibold",
            "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_hr]:my-6 [&_hr]:border-border",
            "[&_ol]:ml-6 [&_ol]:list-decimal [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_ul]:ml-6 [&_ul]:list-disc [&_li]:pl-1",
            "overflow-x-auto [&_table]:w-full [&_table]:border-collapse [&_table]:font-sans [&_table]:text-sm [&_td]:min-w-20 [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:bg-muted [&_th]:p-2 [&_th]:text-left [&_h4]:font-semibold",
          ),
        },
      },
      // ProseMirror builds attrs as null-prototype objects, which server actions silently drop (losing heading levels and link hrefs), so pass plain JSON.
      onUpdate: ({ editor }) => onChange(JSON.parse(JSON.stringify(editor.getJSON())) as JSONContent),
    },
    [assetKey, featureKey],
  );

  useEffect(() => {
    if (!editor) return;
    const nextContent = richTextContent(value);
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(nextContent)) {
      editor.commands.setContent(nextContent, { emitUpdate: false });
    }
  }, [editor, value]);

  function setLink() {
    if (!editor) return;
    editor.chain().focus().extendMarkRange("link").run();
    const { from, to } = editor.state.selection;
    const attrs = editor.getAttributes("link");
    setLinkDialog({ from, to, text: editor.state.doc.textBetween(from, to, " "), editing: editor.isActive("link"), initial: {
      kind: attrs.kind === "page" || attrs.kind === "asset" ? attrs.kind : "url",
      href: attrs.href ?? null, entryId: attrs.entryId ?? null, assetId: attrs.assetId ?? null, target: attrs.target ?? null,
    } });
  }

  function applyLink(link: RichTextLink, label: string) {
    if (!editor || !linkDialog) return;
    const chain = editor.chain().focus().setTextSelection({ from: linkDialog.from, to: linkDialog.to });
    if (label === linkDialog.text && linkDialog.from !== linkDialog.to) {
      chain.setMark("link", { ...link, rel: "noopener noreferrer" }).setMeta("preventAutolink", true).run();
    } else {
      chain.insertContent({ type: "text", text: label, marks: [{ type: "link", attrs: { ...link, rel: "noopener noreferrer" } }] }).setMeta("preventAutolink", true).run();
    }
    setLinkDialog(null);
  }

  function removeLink() {
    if (!editor || !linkDialog) return;
    editor.chain().focus().setTextSelection({ from: linkDialog.from, to: linkDialog.to }).unsetLink().run();
    setLinkDialog(null);
  }

  function insertAsset(assetId: string) {
    editor?.chain().focus().insertContent({ type: "asset", attrs: { assetId } }).run();
  }

  if (!editor) {
    return <div className="min-h-64 rounded-lg border border-input bg-card" />;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-input bg-card focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
      <div className="flex flex-wrap items-center gap-1 border-b bg-muted/60 p-1.5">
        <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run()}>Insert table</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().addRowAfter().run()}>Add row</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().addColumnAfter().run()}>Add column</Button>
        <ToolbarButton active={editor.isActive("bold")} label="Bold" onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("italic")} label="Italic" onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic />
        </ToolbarButton>
        {features.headings && (
          <>
            <ToolbarButton active={editor.isActive("heading", { level: 2 })} label="Heading 2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
              <Heading2 />
            </ToolbarButton>
            <ToolbarButton active={editor.isActive("heading", { level: 3 })} label="Heading 3" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
              <Heading3 />
            </ToolbarButton>
          </>
        )}
        {features.lists && (
          <>
            <ToolbarButton active={editor.isActive("bulletList")} label="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()}>
              <List />
            </ToolbarButton>
            <ToolbarButton active={editor.isActive("orderedList")} label="Ordered list" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
              <ListOrdered />
            </ToolbarButton>
          </>
        )}
        {features.links && (
          <>
            <ToolbarButton active={editor.isActive("link")} label="Set link" onClick={setLink}>
              <Link2 />
            </ToolbarButton>
            <ToolbarButton disabled={!editor.isActive("link")} label="Remove link" onClick={() => editor.chain().focus().unsetLink().run()}>
              <Unlink />
            </ToolbarButton>
          </>
        )}
        {features.code && (
          <>
            <ToolbarButton active={editor.isActive("code")} label="Inline code" onClick={() => editor.chain().focus().toggleCode().run()}>
              <Code />
            </ToolbarButton>
            <ToolbarButton active={editor.isActive("codeBlock")} label="Code block" onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
              <Code />
            </ToolbarButton>
          </>
        )}
        {features.quotes && (
          <>
            <ToolbarButton active={editor.isActive("blockquote")} label="Quote" onClick={() => editor.chain().focus().toggleBlockquote().run()}>
              <Quote />
            </ToolbarButton>
            <ToolbarButton label="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
              <Minus />
            </ToolbarButton>
          </>
        )}
        <ToolbarButton disabled={!editor.can().chain().focus().undo().run()} label="Undo" onClick={() => editor.chain().focus().undo().run()}>
          <Undo2 />
        </ToolbarButton>
        <ToolbarButton disabled={!editor.can().chain().focus().redo().run()} label="Redo" onClick={() => editor.chain().focus().redo().run()}>
          <Redo2 />
        </ToolbarButton>
        {features.media && readyAssets.length > 0 && (
          <Select onValueChange={insertAsset}>
            <SelectTrigger className="ml-auto h-7 w-44 text-xs">
              <ImageIcon data-icon="inline-start" />
              <SelectValue placeholder="Insert asset" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {readyAssets.map((asset) => (
                  <SelectItem key={asset.id} value={asset.id}>{asset.originalName}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      </div>
      <EditorContent editor={editor} />
      {linkDialog && <LinkDialog tenantSlug={tenantSlug} locale={locale} initial={linkDialog.initial} text={linkDialog.text} editing={linkDialog.editing} onApply={applyLink} onRemove={removeLink} onClose={() => { setLinkDialog(null); editor.commands.focus(); }} />}
    </div>
  );
}

function ToolbarButton({ active, disabled, label, onClick, children }: { active?: boolean; disabled?: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" size="icon-sm" variant={active ? "secondary" : "ghost"} disabled={disabled} aria-label={label} title={label} onClick={onClick}>
      {children}
    </Button>
  );
}

function richTextContent(value: unknown): JSONContent {
  return isRichTextDocument(value) ? (value as JSONContent) : (createEmptyRichTextDocument() as JSONContent);
}

function extensionsFor(features: RichTextFeatureConfig, assets: AssetWithPreview[]) {
  return [
    StarterKit.configure({
      blockquote: features.quotes ? undefined : false,
      bulletList: features.lists ? undefined : false,
      code: features.code ? undefined : false,
      codeBlock: features.code ? undefined : false,
      heading: features.headings ? { levels: [1, 2, 3, 4, 5, 6] } : false,
      link: false,
      horizontalRule: features.quotes ? undefined : false,
      listItem: features.lists ? undefined : false,
      orderedList: features.lists ? undefined : false,
    }),
    TableKit,
    ...(features.links ? [RichTextLinkExtension.configure({ openOnClick: false, autolink: true, HTMLAttributes: { target: null, rel: "noopener noreferrer" } })] : []),
    ...(features.media ? [AssetNode.configure({ assets })] : []),
    Placeholder.configure({ placeholder: "Start writing..." }),
  ];
}

const AssetNode = Node.create<{ assets: AssetWithPreview[] }>({
  name: "asset",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return { assets: [] };
  },

  addAttributes() {
    return {
      assetId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-asset-id"),
        renderHTML: (attributes) => ({ "data-asset-id": attributes.assetId }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "cms-asset[data-asset-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["cms-asset", mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AssetNodeView);
  },
});

function AssetNodeView(props: NodeViewProps) {
  const assetId = props.node.attrs.assetId as string | null;
  const assets = props.extension.options.assets as AssetWithPreview[];
  const asset = assets.find((item) => item.id === assetId);

  return (
    <NodeViewWrapper className="my-3 rounded-md border bg-muted p-3 font-sans" data-asset-id={assetId ?? ""}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{asset?.originalName ?? "Unknown asset"}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">{assetId}</p>
        </div>
        <Badge variant="secondary">asset</Badge>
      </div>
      {asset && <p className="mt-2 text-xs text-muted-foreground">{asset.mimeType}</p>}
    </NodeViewWrapper>
  );
}
