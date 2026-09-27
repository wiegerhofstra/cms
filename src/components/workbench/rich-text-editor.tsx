"use client";

import { Node, mergeAttributes, type JSONContent } from "@tiptap/core";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type NodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { Bold, Code, Heading2, Heading3, ImageIcon, Italic, Link2, List, ListOrdered, Minus, Quote, Redo2, Undo2, Unlink } from "lucide-react";
import { useEffect } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AssetWithPreview } from "@/lib/cms/types";
import { cn } from "@/lib/utils";
import { createEmptyRichTextDocument, isRichTextDocument, richTextFeaturesFromConfig, type RichTextFeatureConfig } from "@/lib/rich-text";

type RichTextEditorProps = {
  id: string;
  value: unknown;
  config: Record<string, unknown>;
  assets: AssetWithPreview[];
  onChange: (value: JSONContent) => void;
};

export function RichTextEditor({ id, value, config, assets, onChange }: RichTextEditorProps) {
  const features = richTextFeaturesFromConfig(config);
  const featureKey = Object.values(features).join(":");
  const readyAssets = assets.filter((asset) => asset.status === "ready");
  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: extensionsFor(features, readyAssets),
      content: richTextContent(value),
      editorProps: {
        attributes: {
          id,
          class: cn(
            "min-h-52 rounded-b-xl border border-t-0 bg-background px-3 py-3 text-sm outline-none",
            "[&_blockquote]:border-l-4 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
            "[&_code]:rounded-md [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono",
            "[&_h2]:mt-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:text-lg [&_h3]:font-semibold",
            "[&_ol]:ml-5 [&_ol]:list-decimal [&_p]:leading-7 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_ul]:ml-5 [&_ul]:list-disc",
            "overflow-x-auto [&_table]:w-full [&_table]:border-collapse [&_td]:min-w-20 [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:bg-muted [&_th]:p-2 [&_th]:text-left [&_h4]:font-semibold",
          ),
        },
      },
      onUpdate: ({ editor }) => onChange(editor.getJSON()),
    },
    [assets, featureKey],
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
    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", previousUrl ?? "https://");
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  function insertAsset(assetId: string) {
    editor?.chain().focus().insertContent({ type: "asset", attrs: { assetId } }).run();
  }

  if (!editor) {
    return <div className="min-h-52 rounded-xl border bg-muted/30" />;
  }

  return (
    <div className="rounded-xl border bg-muted/30">
      <div className="flex flex-wrap items-center gap-1 border-b p-2">
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
    ...(features.links ? [Link.configure({ openOnClick: false, autolink: true })] : []),
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
    <NodeViewWrapper className="my-3 rounded-xl border bg-muted/40 p-3" data-asset-id={assetId ?? ""}>
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
