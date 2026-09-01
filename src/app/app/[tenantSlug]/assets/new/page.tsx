import { Suspense } from "react";

import { AssetCreatePanel } from "@/components/workbench/assets-panel";
import { WorkbenchPageFallback } from "@/components/workbench/workbench-loading";
import { getCmsPageData } from "@/lib/cms/ssr";

export default function NewAssetPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  return (
    <Suspense fallback={<WorkbenchPageFallback label="Loading asset uploader" />}>
      <NewAssetContent params={params} />
    </Suspense>
  );
}

async function NewAssetContent({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  await getCmsPageData({ tenantSlug, view: "asset-new" });

  return <AssetCreatePanel tenantSlug={tenantSlug} />;
}
