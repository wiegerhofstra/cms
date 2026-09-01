import { Suspense } from "react";

import { EntriesPanel } from "@/components/workbench/entries-panel";
import { WorkbenchPageFallback } from "@/components/workbench/workbench-loading";
import { getCmsPageData } from "@/lib/cms/ssr";

export default function EntryDetailPage({ params }: { params: Promise<{ tenantSlug: string; modelId: string; entryId: string }> }) {
  return (
    <Suspense fallback={<WorkbenchPageFallback label="Loading entry" />}>
      <EntryDetailContent params={params} />
    </Suspense>
  );
}

async function EntryDetailContent({ params }: { params: Promise<{ tenantSlug: string; modelId: string; entryId: string }> }) {
  const { tenantSlug, modelId, entryId } = await params;
  const data = await getCmsPageData({ tenantSlug, view: "entry-detail", modelId, entryId });

  return (
    <EntriesPanel
      tenantSlug={tenantSlug}
      models={data.models}
      assets={data.assets}
      fields={data.fields}
      entries={data.entries}
      componentReferences={data.componentReferences}
      entry={data.entry}
      revisions={data.revisions}
      activeModelId={data.activeModelId}
      activeEntryId={data.activeEntryId}
      query={data.entryQuery}
    />
  );
}
