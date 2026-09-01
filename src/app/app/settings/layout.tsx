import { Suspense, type ReactNode } from "react";
import { notFound } from "next/navigation";

import { AppNav } from "@/components/workbench/app-nav";
import { SettingsMenu } from "@/components/workbench/settings-nav";
import { WorkbenchShellFallback } from "@/components/workbench/workbench-loading";
import { getCmsPageData } from "@/lib/cms/ssr";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<WorkbenchShellFallback label="Loading settings" />}>
      <SettingsShell>{children}</SettingsShell>
    </Suspense>
  );
}

async function SettingsShell({ children }: { children: ReactNode }) {
  const data = await getCmsPageData({ view: "dashboard" });
  const activeMembership = data.me.memberships.find((membership) => membership.tenantId === data.me.activeTenantId) ?? data.me.memberships[0];
  const tenantSlug = activeMembership?.tenant.slug;
  const tenantMenuName = activeMembership?.tenant.name ?? "CMS";
  const isAdmin = data.me.user.role === "admin";
  if (!isAdmin) notFound();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[17rem_1fr]">
        <AppNav
          memberships={data.me.memberships}
          selectedTenantId={activeMembership?.tenantId}
          tenantSlug={tenantSlug}
          tenantMenuName={tenantMenuName}
        />
        <section className="min-w-0">
          <header className="sticky top-0 z-10 border-b bg-background/90 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.26em] text-muted-foreground">Global administration</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">Settings</h1>
              </div>
              <SettingsMenu />
            </div>
          </header>
          <div className="grid gap-6 p-4 sm:p-6 lg:p-8">{children}</div>
        </section>
      </div>
    </main>
  );
}
