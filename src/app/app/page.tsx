import { Suspense } from "react";
import { redirect } from "next/navigation";

import { Skeleton } from "@/components/ui/skeleton";
import { NoActiveTenantCard } from "@/components/workbench/no-active-tenant-card";
import { getCmsPageData } from "@/lib/cms/ssr";

export default function AppPage() {
  return (
    <Suspense fallback={<AppPageFallback />}>
      <AppPageContent />
    </Suspense>
  );
}

async function AppPageContent() {
  const data = await getCmsPageData({ view: "dashboard" });
  const activeMembership = data.me.memberships.find((membership) => membership.tenantId === data.me.activeTenantId) ?? data.me.memberships[0];

  if (activeMembership) redirect(`/app/${activeMembership.tenant.slug}`);

  return (
    <main className="grid min-h-screen place-items-center bg-background p-4 text-foreground">
      <div className="w-full max-w-lg">
        <NoActiveTenantCard isAdmin={data.me.user.role === "admin"} />
      </div>
    </main>
  );
}

function AppPageFallback() {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-4 text-foreground" aria-label="Loading workbench">
      <div className="w-full max-w-lg space-y-4 rounded-[var(--radius-lg)] border bg-card p-6 shadow-sm">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-10 w-36" />
      </div>
    </main>
  );
}
