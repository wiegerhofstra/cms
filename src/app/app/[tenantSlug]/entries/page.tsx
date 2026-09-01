import { Suspense } from "react";
import { redirect } from "next/navigation";

import { EntriesIndexPanel } from "@/components/workbench/entries-panel";
import { WorkbenchPageFallback } from "@/components/workbench/workbench-loading";
import { getCmsPageData } from "@/lib/cms/ssr";

export default function EntriesPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  return (
    <Suspense fallback={<WorkbenchPageFallback label="Loading entries" />}>
      <EntriesContent params={params} />
    </Suspense>
  );
}

async function EntriesContent({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const data = await getCmsPageData({ tenantSlug, view: "entries" });
  const firstModelId = data.models[0]?.id;

  if (firstModelId) redirect(`/app/${tenantSlug}/entries/${firstModelId}`);

  return <EntriesIndexPanel tenantSlug={tenantSlug} models={data.models} fields={data.fields} entries={data.entries} activeModelId="" query={data.entryQuery} />;
}
