import { Suspense } from "react";

import { ModelCreatePanel } from "@/components/workbench/models-panel";
import { WorkbenchPageFallback } from "@/components/workbench/workbench-loading";
import { getCmsPageData } from "@/lib/cms/ssr";

export default function NewModelPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  return (
    <Suspense fallback={<WorkbenchPageFallback label="Loading model editor" />}>
      <NewModelContent params={params} />
    </Suspense>
  );
}

async function NewModelContent({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  await getCmsPageData({ tenantSlug, view: "model-new" });

  return <ModelCreatePanel tenantSlug={tenantSlug} />;
}
