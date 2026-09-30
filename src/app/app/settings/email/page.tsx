import { Suspense } from "react";
import { notFound } from "next/navigation";

import { EmailSettingsPanel } from "@/components/workbench/email-settings-panel";
import { WorkbenchPageFallback } from "@/components/workbench/workbench-loading";
import { getCmsPageData } from "@/lib/cms/ssr";
import { emailCredentialsReady } from "@/modules/email/credentials";
import { getEmailSettingsForAdmin } from "@/modules/email/service";

export default function SettingsEmailPage({ searchParams }: PageProps<"/app/settings/email">) {
  return <Suspense fallback={<WorkbenchPageFallback label="Loading email settings" />}><EmailContent searchParams={searchParams} /></Suspense>;
}

async function EmailContent({ searchParams }: Pick<PageProps<"/app/settings/email">, "searchParams">) {
  const data = await getCmsPageData({ view: "tenant-settings" });
  const query = await searchParams;
  const tenantId = typeof query.tenant === "string" ? query.tenant : data.me.activeTenantId ?? data.me.memberships[0]?.tenantId ?? data.tenants[0]?.id;
  const tenant = data.tenants.find((item) => item.id === tenantId);
  if (tenantId && !tenant) notFound();
  const settings = tenant ? await getEmailSettingsForAdmin(tenant.id) : null;
  return <EmailSettingsPanel key={`${tenantId}-${settings?.updatedAt}`} tenants={data.tenants} tenant={tenant ?? null} settings={settings} credentialsReady={emailCredentialsReady()} />;
}
