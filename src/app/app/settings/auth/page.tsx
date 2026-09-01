import { Suspense } from "react";

import { AccessTokensPanel } from "@/components/workbench/access-tokens-panel";
import { WorkbenchPageFallback } from "@/components/workbench/workbench-loading";
import { getCmsPageData } from "@/lib/cms/ssr";

export default function SettingsAuthPage() {
  return (
    <Suspense fallback={<WorkbenchPageFallback label="Loading authentication settings" />}>
      <SettingsAuthContent />
    </Suspense>
  );
}

async function SettingsAuthContent() {
  const data = await getCmsPageData({ view: "auth" });

  return <AccessTokensPanel accessTokens={data.accessTokens} tenants={data.tenants} />;
}
