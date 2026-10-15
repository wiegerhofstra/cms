import { Suspense } from "react";

import { EntryEmptyState } from "@/components/workbench/entries-panel";
import { EntryEditorFallback } from "@/components/workbench/workbench-loading";

type ModelEntriesPageProps = {
  params: Promise<{ tenantSlug: string; modelId: string }>;
};

export default function ModelEntriesPage({ params }: ModelEntriesPageProps) {
  return (
    <Suspense fallback={<EntryEditorFallback />}>
      <ModelEntriesContent params={params} />
    </Suspense>
  );
}

async function ModelEntriesContent({ params }: ModelEntriesPageProps) {
  const { tenantSlug, modelId } = await params;

  return <EntryEmptyState tenantSlug={tenantSlug} modelId={modelId} />;
}
