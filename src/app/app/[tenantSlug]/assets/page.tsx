import { Suspense } from "react";
import { redirect } from "next/navigation";

import { AssetsPanel } from "@/components/workbench/assets-panel";
import { WorkbenchPageFallback } from "@/components/workbench/workbench-loading";
import { getCmsPageData } from "@/lib/cms/ssr";
import type { AssetSort } from "@/lib/cms/types";

const assetSorts = new Set<AssetSort>(["date-desc", "date-asc", "name-asc", "name-desc", "type-asc", "size-desc"]);

type AssetsPageProps = {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ q?: string; sort?: string; page?: string }>;
};

export default function AssetsPage({ params, searchParams }: AssetsPageProps) {
  return (
    <Suspense fallback={<WorkbenchPageFallback label="Loading assets" />}>
      <AssetsContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function AssetsContent({
  params,
  searchParams,
}: AssetsPageProps) {
  const [{ tenantSlug }, { q, sort, page }] = await Promise.all([params, searchParams]);
  const assetSort = assetSorts.has(sort as AssetSort) ? (sort as AssetSort) : "date-desc";
  const parsedPage = Number.parseInt(page ?? "1", 10);
  const assetPage = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const data = await getCmsPageData({ tenantSlug, view: "assets", assetQuery: q, assetSort, assetPage });
  const totalPages = Math.max(1, Math.ceil(data.assetTotal / data.assetPageSize));

  if (assetPage > totalPages) {
    const redirectParams = new URLSearchParams();
    if (data.assetQuery) redirectParams.set("q", data.assetQuery);
    if (data.assetSort !== "date-desc") redirectParams.set("sort", data.assetSort);
    if (totalPages > 1) redirectParams.set("page", String(totalPages));
    const redirectQuery = redirectParams.toString();
    redirect(`/app/${tenantSlug}/assets${redirectQuery ? `?${redirectQuery}` : ""}`);
  }

  return (
    <AssetsPanel
      tenantSlug={tenantSlug}
      assets={data.assets}
      query={data.assetQuery}
      sort={data.assetSort}
      page={data.assetPage}
      pageSize={data.assetPageSize}
      total={data.assetTotal}
    />
  );
}
