import { Suspense } from "react";

import { ModelsPanel } from "@/components/workbench/models-panel";
import { WorkbenchPageFallback } from "@/components/workbench/workbench-loading";
import { getCmsPageData } from "@/lib/cms/ssr";

export default function ModelDetailPage({ params }: { params: Promise<{ tenantSlug: string; modelId: string }> }) {
  return (
    <Suspense fallback={<WorkbenchPageFallback label="Loading model" />}>
      <ModelDetailContent params={params} />
    </Suspense>
  );
}

async function ModelDetailContent({ params }: { params: Promise<{ tenantSlug: string; modelId: string }> }) {
  const { tenantSlug, modelId } = await params;
  const data = await getCmsPageData({ tenantSlug, view: "model-detail", modelId });
  const activeModel = data.models.find((model) => model.id === data.activeModelId) ?? null;

  return <ModelsPanel tenantSlug={tenantSlug} models={data.models} activeModel={activeModel} activeModelId={data.activeModelId} fields={data.fields} hasActiveModelEntries={data.entries.length > 0} />;
}
