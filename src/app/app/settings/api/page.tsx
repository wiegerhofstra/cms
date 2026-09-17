import { Suspense } from "react";

import { ApiReferencePanel } from "@/components/workbench/api-reference-panel";
import { WorkbenchPageFallback } from "@/components/workbench/workbench-loading";
import { getCmsPageData } from "@/lib/cms/ssr";

export default function SettingsApiPage() {
  return (
    <Suspense fallback={<WorkbenchPageFallback label="Loading API reference" />}>
      <SettingsApiContent />
    </Suspense>
  );
}

async function SettingsApiContent() {
  const data = await getCmsPageData({ view: "tenant-settings" });
  const activeTenant =
    data.me.memberships.find((membership) => membership.tenantId === data.me.activeTenantId)?.tenant ??
    data.me.memberships[0]?.tenant;

  return <ApiReferencePanel tenants={data.tenants} initialTenantSlug={activeTenant?.slug ?? ""} />;
}
