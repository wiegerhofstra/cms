import { Suspense } from "react";
import { notFound } from "next/navigation";

import { RevalidationSettingsPanel } from "@/components/workbench/revalidation-settings-panel";
import { WorkbenchPageFallback } from "@/components/workbench/workbench-loading";
import { getCmsPageData } from "@/lib/cms/ssr";
import { getRevalidationSettingsForAdmin } from "@/modules/revalidation/service";

export default function SettingsRevalidationPage({ searchParams }: PageProps<"/app/settings/revalidation">) {
  return <Suspense fallback={<WorkbenchPageFallback label="Loading website settings" />}><RevalidationContent searchParams={searchParams} /></Suspense>;
}

async function RevalidationContent({ searchParams }: Pick<PageProps<"/app/settings/revalidation">, "searchParams">) {
  const data = await getCmsPageData({ view: "tenant-settings" });
  const query = await searchParams;
  const tenantId = typeof query.tenant === "string" ? query.tenant : data.me.activeTenantId ?? data.me.memberships[0]?.tenantId ?? data.tenants[0]?.id;
  const tenant = data.tenants.find((item) => item.id === tenantId);
  if (tenantId && !tenant) notFound();
  const settings = tenant ? await getRevalidationSettingsForAdmin(tenant.id) : null;
  return <RevalidationSettingsPanel key={`${tenantId}-${tenant?.consumerType}-${settings?.updatedAt}`} tenants={data.tenants} tenant={tenant ?? null} settings={settings} />;
}
