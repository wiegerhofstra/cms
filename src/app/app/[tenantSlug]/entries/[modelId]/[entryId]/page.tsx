import { Suspense } from "react";

import { EntryEditorPanel } from "@/components/workbench/entries-panel";
import { EntryEditorFallback } from "@/components/workbench/workbench-loading";
import { getCmsPageData } from "@/lib/cms/ssr";

export default function EntryDetailPage({ params }: { params: Promise<{ tenantSlug: string; modelId: string; entryId: string }> }) {
  return (
    <Suspense fallback={<EntryEditorFallback />}>
      <EntryDetailContent params={params} />
    </Suspense>
  );
}

async function EntryDetailContent({ params }: { params: Promise<{ tenantSlug: string; modelId: string; entryId: string }> }) {
  const { tenantSlug, modelId, entryId } = await params;
  const data = await getCmsPageData({ tenantSlug, view: "entry-detail", modelId, entryId });
  if (!data.entry) return null;

  return (
    <EntryEditorPanel
      key={`${data.entry.id}:${data.entry.updatedAt}`}
      tenantSlug={tenantSlug}
      model={data.models.find((model) => model.id === data.activeModelId) ?? null}
      assets={data.assets}
      fields={data.fields}
      componentReferences={data.componentReferences}
      entry={data.entry}
      revisions={data.revisions}
    />
  );
}
