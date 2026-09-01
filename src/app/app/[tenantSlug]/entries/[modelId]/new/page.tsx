import { Suspense } from "react";

import { EntryCreatePanel } from "@/components/workbench/entries-panel";
import { WorkbenchPageFallback } from "@/components/workbench/workbench-loading";
import { getCmsPageData } from "@/lib/cms/ssr";

export default function NewEntryPage({ params }: { params: Promise<{ tenantSlug: string; modelId: string }> }) {
  return (
    <Suspense fallback={<WorkbenchPageFallback label="Loading entry editor" />}>
      <NewEntryContent params={params} />
    </Suspense>
  );
}

async function NewEntryContent({ params }: { params: Promise<{ tenantSlug: string; modelId: string }> }) {
  const { tenantSlug, modelId } = await params;
  const data = await getCmsPageData({ tenantSlug, view: "entry-new", modelId });

  return (
    <EntryCreatePanel
      tenantSlug={tenantSlug}
      models={data.models}
      assets={data.assets}
      fields={data.fields}
      componentReferences={data.componentReferences}
      activeModelId={data.activeModelId}
    />
  );
}
