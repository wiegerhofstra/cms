import { Suspense } from "react";

import { TenantSettingsPanel } from "@/components/workbench/tenant-panel";
import { WorkbenchPageFallback } from "@/components/workbench/workbench-loading";
import { getCmsPageData } from "@/lib/cms/ssr";

export default function SettingsTenantsPage() {
  return (
    <Suspense fallback={<WorkbenchPageFallback label="Loading tenant settings" />}>
      <SettingsTenantsContent />
    </Suspense>
  );
}

async function SettingsTenantsContent() {
  const data = await getCmsPageData({ view: "tenant-settings" });
  const activeTenantId = data.me.activeTenantId ?? data.me.memberships[0]?.tenantId ?? null;

  return <TenantSettingsPanel tenants={data.tenants} activeTenantId={activeTenantId} />;
}
