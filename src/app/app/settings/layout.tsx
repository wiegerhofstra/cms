import { Suspense, type ReactNode } from "react";
import { notFound } from "next/navigation";

import { SettingsTabs } from "@/components/workbench/settings-nav";
import { WorkbenchShellFallback } from "@/components/workbench/workbench-loading";
import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { getCmsShellData } from "@/lib/cms/ssr";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<WorkbenchShellFallback label="Loading settings" />}>
      <SettingsShell>{children}</SettingsShell>
    </Suspense>
  );
}

async function SettingsShell({ children }: { children: ReactNode }) {
  const shell = await getCmsShellData();
  if (shell.me.user.role !== "admin") notFound();

  return (
    <WorkbenchShell shell={shell}>
      <SettingsTabs />
      {children}
    </WorkbenchShell>
  );
}
