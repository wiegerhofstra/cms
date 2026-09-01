import { Suspense } from "react";
import { notFound } from "next/navigation";

import { AssetDetailPanel } from "@/components/workbench/assets-panel";
import { WorkbenchPageFallback } from "@/components/workbench/workbench-loading";
import { getCmsPageData } from "@/lib/cms/ssr";

export default function AssetDetailPage({ params }: { params: Promise<{ tenantSlug: string; assetId: string }> }) {
  return (
    <Suspense fallback={<WorkbenchPageFallback label="Loading asset" />}>
      <AssetDetailContent params={params} />
    </Suspense>
  );
}

async function AssetDetailContent({ params }: { params: Promise<{ tenantSlug: string; assetId: string }> }) {
  const { tenantSlug, assetId } = await params;
  const data = await getCmsPageData({ tenantSlug, view: "asset-detail" });
  const asset = data.assets.find((item) => item.id === assetId);

  if (!asset) notFound();

  return <AssetDetailPanel tenantSlug={tenantSlug} asset={asset} />;
}
