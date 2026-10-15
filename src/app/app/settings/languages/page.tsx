import { Suspense } from "react";
import { notFound } from "next/navigation";

import { LocalizationSettingsPanel } from "@/components/workbench/localization-settings-panel";
import { WorkbenchPageFallback } from "@/components/workbench/workbench-loading";
import { getCmsPageData } from "@/lib/cms/ssr";
import { getLocalizationSettingsForAdmin } from "@/modules/localization/service";

export default function SettingsLanguagesPage({ searchParams }: PageProps<"/app/settings/languages">) {
  return <Suspense fallback={<WorkbenchPageFallback label="Loading language settings" />}><LanguagesContent searchParams={searchParams} /></Suspense>;
}

async function LanguagesContent({ searchParams }: Pick<PageProps<"/app/settings/languages">, "searchParams">) {
  const data = await getCmsPageData({ view: "tenant-settings" });
  const query = await searchParams;
  const tenantId = typeof query.tenant === "string" ? query.tenant : data.me.activeTenantId ?? data.me.memberships[0]?.tenantId ?? data.tenants[0]?.id;
  const tenant = data.tenants.find((item) => item.id === tenantId);
  if (tenantId && !tenant) notFound();
  const settings = tenant ? await getLocalizationSettingsForAdmin(tenant.id) : null;
  return <LocalizationSettingsPanel key={`${tenantId}-${settings?.defaultLocale}-${settings?.locales.join(",")}`} tenants={data.tenants} tenant={tenant ?? null} settings={settings} />;
}
