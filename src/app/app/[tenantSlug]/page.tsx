import { Suspense } from "react";

import { DashboardPanel } from "@/components/workbench/dashboard-panel";
import { DashboardFallback } from "@/components/workbench/workbench-loading";
import { getCmsDashboardData, getCmsShellData } from "@/lib/cms/ssr";

export default function TenantDashboardPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  return (
    <Suspense fallback={<DashboardFallback />}>
      <TenantDashboardContent params={params} />
    </Suspense>
  );
}

async function TenantDashboardContent({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const [shell, dashboard] = await Promise.all([getCmsShellData(tenantSlug), getCmsDashboardData(tenantSlug)]);

  return <DashboardPanel tenantSlug={tenantSlug} shell={shell} dashboard={dashboard} />;
}
