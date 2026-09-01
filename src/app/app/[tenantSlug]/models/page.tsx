import { Suspense } from "react";

import { ModelsPanel } from "@/components/workbench/models-panel";
import { WorkbenchPageFallback } from "@/components/workbench/workbench-loading";
import { getCmsPageData } from "@/lib/cms/ssr";

export default function ModelsPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  return (
    <Suspense fallback={<WorkbenchPageFallback label="Loading models" />}>
      <ModelsContent params={params} />
    </Suspense>
  );
}

async function ModelsContent({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const data = await getCmsPageData({ tenantSlug, view: "models" });
  const activeModel = data.models.find((model) => model.id === data.activeModelId) ?? null;

  return <ModelsPanel tenantSlug={tenantSlug} models={data.models} activeModel={activeModel} activeModelId={data.activeModelId} fields={data.fields} hasActiveModelEntries={data.entries.length > 0} />;
}
