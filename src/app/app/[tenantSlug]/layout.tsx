import { Suspense, type ReactNode } from "react";

import { AppNav } from "@/components/workbench/app-nav";
import { SettingsMenu } from "@/components/workbench/settings-nav";
import { WorkbenchShellFallback } from "@/components/workbench/workbench-loading";
import { getCmsPageData } from "@/lib/cms/ssr";

export default function TenantWorkbenchLayout({ children, params }: { children: ReactNode; params: Promise<{ tenantSlug: string }> }) {
  return (
    <Suspense fallback={<WorkbenchShellFallback />}>
      <TenantWorkbenchShell params={params}>{children}</TenantWorkbenchShell>
    </Suspense>
  );
}

async function TenantWorkbenchShell({ children, params }: { children: ReactNode; params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const data = await getCmsPageData({ tenantSlug, view: "dashboard" });
  const activeTenant = data.me.memberships.find((membership) => membership.tenant.slug === tenantSlug) ?? null;
  const tenantMenuName = activeTenant?.tenant.name ?? tenantSlug;
  const isAdmin = data.me.user.role === "admin";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[17rem_1fr]">
        <AppNav
          memberships={data.me.memberships}
          selectedTenantId={activeTenant?.tenantId}
          tenantSlug={tenantSlug}
          tenantMenuName={tenantMenuName}
        />
        <section className="min-w-0">
          <header className="sticky top-0 z-10 border-b bg-background/90 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.26em] text-muted-foreground">Server-rendered CMS</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">{tenantMenuName}</h1>
              </div>
              {isAdmin ? <SettingsMenu /> : null}
            </div>
          </header>
          <div className="grid gap-6 p-4 sm:p-6 lg:p-8">{children}</div>
        </section>
      </div>
    </main>
  );
}
