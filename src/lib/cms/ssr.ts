import "server-only";

import { notFound, redirect } from "next/navigation";

import { CmsError } from "@/lib/cms/errors";
import { getWorkbenchData } from "@/lib/cms/workbench";
import type { LoadWorkbenchDataInput } from "@/lib/cms/types";

export async function getCmsPageData(input: LoadWorkbenchDataInput = {}) {
  try {
    return await getWorkbenchData(input);
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
