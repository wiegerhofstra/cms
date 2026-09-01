import { Suspense } from "react";

import { DashboardPanel } from "@/components/workbench/dashboard-panel";
import { WorkbenchPageFallback } from "@/components/workbench/workbench-loading";
import { getCmsPageData } from "@/lib/cms/ssr";

export default function TenantDashboardPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  return (
    <Suspense fallback={<WorkbenchPageFallback label="Loading dashboard" />}>
      <TenantDashboardContent params={params} />
    </Suspense>
  );
}

async function TenantDashboardContent({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const data = await getCmsPageData({ tenantSlug, view: "dashboard" });

  return <DashboardPanel tenantSlug={tenantSlug} me={data.me} models={data.models} assets={data.assets} />;
}
