import "server-only";

import { notFound, redirect } from "next/navigation";

import { CmsError } from "@/lib/cms/errors";
import { getDashboard, getEntryList, getWorkbenchData, getWorkbenchShell } from "@/lib/cms/workbench";
import type { LoadWorkbenchDataInput } from "@/lib/cms/types";

export async function getCmsPageData(input: LoadWorkbenchDataInput = {}) {
  return withPageErrors(() => getWorkbenchData(input));
}

export async function getCmsShellData(tenantSlug?: string) {
  return withPageErrors(() => getWorkbenchShell(tenantSlug));
}

export async function getCmsEntryListData(tenantSlug: string, modelId: string) {
  return withPageErrors(() => getEntryList(tenantSlug, modelId));
}

export async function getCmsDashboardData(tenantSlug: string) {
  return withPageErrors(() => getDashboard(tenantSlug));
}

async function withPageErrors<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof CmsError && error.code === "UNAUTHORIZED") {
      redirect("/login");
    }

    if (error instanceof CmsError && (error.code === "NOT_FOUND" || error.code === "FORBIDDEN")) {
      notFound();
    }

    throw error;
  }
}
