import { Suspense, type ReactNode } from "react";

import { WorkbenchShellFallback } from "@/components/workbench/workbench-loading";
import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { getCmsShellData } from "@/lib/cms/ssr";

export default function TenantWorkbenchLayout({ children, params }: { children: ReactNode; params: Promise<{ tenantSlug: string }> }) {
  return (
    <Suspense fallback={<WorkbenchShellFallback />}>
      <TenantWorkbenchShell params={params}>{children}</TenantWorkbenchShell>
    </Suspense>
  );
}

async function TenantWorkbenchShell({ children, params }: { children: ReactNode; params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const shell = await getCmsShellData(tenantSlug);

  return <WorkbenchShell shell={shell}>{children}</WorkbenchShell>;
}
