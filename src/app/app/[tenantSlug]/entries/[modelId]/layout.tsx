import { Suspense, type ReactNode } from "react";

import { EntriesWorkspace } from "@/components/workbench/entries-panel";
import { EntriesWorkspaceFallback } from "@/components/workbench/workbench-loading";
import { getCmsEntryListData } from "@/lib/cms/ssr";

type EntriesLayoutProps = {
  children: ReactNode;
  params: Promise<{ tenantSlug: string; modelId: string }>;
};

export default function ModelEntriesLayout({ children, params }: EntriesLayoutProps) {
  return (
    <Suspense fallback={<EntriesWorkspaceFallback />}>
      <ModelEntriesWorkspace params={params}>{children}</ModelEntriesWorkspace>
    </Suspense>
  );
}

async function ModelEntriesWorkspace({ children, params }: EntriesLayoutProps) {
  const { tenantSlug, modelId } = await params;
  const { model, fields, entries } = await getCmsEntryListData(tenantSlug, modelId);

  return (
    <EntriesWorkspace tenantSlug={tenantSlug} model={model} fields={fields} entries={entries}>
      {children}
    </EntriesWorkspace>
  );
}
