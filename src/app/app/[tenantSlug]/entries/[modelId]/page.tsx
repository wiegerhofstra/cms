import { Suspense } from "react";

import { EntriesIndexPanel } from "@/components/workbench/entries-panel";
import { WorkbenchPageFallback } from "@/components/workbench/workbench-loading";
import { getCmsPageData } from "@/lib/cms/ssr";

type ModelEntriesPageProps = {
  params: Promise<{ tenantSlug: string; modelId: string }>;
  searchParams: Promise<{ q?: string }>;
};

export default function ModelEntriesPage({ params, searchParams }: ModelEntriesPageProps) {
  return (
    <Suspense fallback={<WorkbenchPageFallback label="Loading entries" />}>
      <ModelEntriesContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ModelEntriesContent({
  params,
  searchParams,
}: ModelEntriesPageProps) {
  const [{ tenantSlug, modelId }, { q }] = await Promise.all([params, searchParams]);
  const data = await getCmsPageData({ tenantSlug, view: "entries", modelId, query: q });

  return <EntriesIndexPanel tenantSlug={tenantSlug} models={data.models} fields={data.fields} entries={data.entries} activeModelId={data.activeModelId} query={data.entryQuery} />;
}
