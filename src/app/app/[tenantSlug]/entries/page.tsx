import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { WorkbenchPageFallback } from "@/components/workbench/workbench-loading";
import { getCmsShellData } from "@/lib/cms/ssr";

export default function EntriesPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  return (
    <Suspense fallback={<WorkbenchPageFallback label="Loading entries" />}>
      <EntriesContent params={params} />
    </Suspense>
  );
}

async function EntriesContent({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const { models } = await getCmsShellData(tenantSlug);
  const firstModel = [...models]
    .sort((a, b) => Number(a.kind === "block") - Number(b.kind === "block") || Number(a.status === "archived") - Number(b.status === "archived") || a.name.localeCompare(b.name))[0];

  if (firstModel) redirect(`/app/${tenantSlug}/entries/${firstModel.id}`);

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="font-medium">No models yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">Entries are based on a model. Create one to describe the content you want to manage.</p>
        <Button asChild className="mt-2"><Link href={`/app/${tenantSlug}/models/new`}>Create model</Link></Button>
      </CardContent>
    </Card>
  );
}
