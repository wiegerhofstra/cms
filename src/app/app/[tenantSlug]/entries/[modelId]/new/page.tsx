import { Suspense } from "react";
import { notFound } from "next/navigation";

import { EntryCreatePanel } from "@/components/workbench/entries-panel";
import { EntryEditorFallback } from "@/components/workbench/workbench-loading";
import { getCmsPageData } from "@/lib/cms/ssr";

export default function NewEntryPage({ params }: { params: Promise<{ tenantSlug: string; modelId: string }> }) {
  return (
    <Suspense fallback={<EntryEditorFallback />}>
      <NewEntryContent params={params} />
    </Suspense>
  );
}

async function NewEntryContent({ params }: { params: Promise<{ tenantSlug: string; modelId: string }> }) {
  const { tenantSlug, modelId } = await params;
  const data = await getCmsPageData({ tenantSlug, view: "entry-new", modelId });
  const model = data.models.find((item) => item.id === data.activeModelId);
  if (!model) notFound();

  return (
    <EntryCreatePanel
      key={model.id}
      tenantSlug={tenantSlug}
      model={model}
      assets={data.assets}
      fields={data.fields}
      componentReferences={data.componentReferences}
      localization={data.localization}
    />
  );
}
