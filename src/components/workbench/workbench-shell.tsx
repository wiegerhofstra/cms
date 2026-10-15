"use client";

import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import type { ContentModel, WorkbenchShell as WorkbenchShellData } from "@/lib/cms/types";
import { AppSidebar, MobileNav } from "./app-nav";
import { useCurrentPageTitle } from "./page-title";
import { RevalidateButton } from "./revalidate-button";
import { settingsLinks } from "./settings-nav";

type Crumb = { label: string; href?: string };

export function WorkbenchShell({ shell, children }: { shell: WorkbenchShellData; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <AppSidebar shell={shell} />
      <div className="min-w-0">
        <WorkbenchHeader shell={shell} />
        <main className="grid gap-6 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

function WorkbenchHeader({ shell }: { shell: WorkbenchShellData }) {
  const pathname = usePathname();
  const pageTitle = useCurrentPageTitle();
  const membership = shell.activeMembership;
  const crumbs = breadcrumbs(pathname, membership ? `/app/${membership.tenant.slug}` : "/app", shell.models, pageTitle);

  return (
    <header className="sticky top-0 z-10 flex h-(--workbench-header) items-center gap-3 border-b bg-background/90 px-4 backdrop-blur sm:px-6 lg:px-8">
      <MobileNav shell={shell} />
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList className="flex-nowrap">
          {crumbs.map((crumb, index) => {
            const isLast = index === crumbs.length - 1;
            return (
              <Fragment key={`${index}-${crumb.label}`}>
                {index > 0 ? <BreadcrumbSeparator /> : null}
                <BreadcrumbItem className="min-w-0">
                  {isLast ? (
                    <BreadcrumbPage className="truncate font-medium">{crumb.label}</BreadcrumbPage>
                  ) : crumb.href ? (
                    <BreadcrumbLink asChild className="truncate"><Link href={crumb.href}>{crumb.label}</Link></BreadcrumbLink>
                  ) : (
                    <span className="truncate">{crumb.label}</span>
                  )}
                </BreadcrumbItem>
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
      {membership && shell.revalidation.configured ? (
        <RevalidateButton key={membership.tenantId} tenantId={membership.tenantId} tenantName={membership.tenant.name} />
      ) : null}
    </header>
  );
}

function breadcrumbs(pathname: string, appPath: string, models: ContentModel[], pageTitle: string | null): Crumb[] {
  if (pathname.startsWith("/app/settings")) {
    const section = settingsLinks.find((link) => pathname.startsWith(link.href));
    return [{ label: "Settings", href: settingsLinks[0]?.href }, ...(section ? [{ label: section.label }] : [])];
  }

  const [section, id, child] = pathname.slice(appPath.length).split("/").filter(Boolean);
  const titleCrumb = pageTitle ? [{ label: pageTitle }] : [];

  if (section === "entries") {
    const model = models.find((item) => item.id === id);
    if (!model) return [{ label: "Entries" }];
    const modelCrumb = { label: model.name, href: `${appPath}/entries/${model.id}` };
    const groupCrumb = { label: model.kind === "block" ? "Blocks" : "Content" };
    if (child === "new") return [groupCrumb, modelCrumb, { label: "New entry" }];
    return [groupCrumb, modelCrumb, ...(child ? titleCrumb : [])];
  }

  if (section === "models") {
    const modelsCrumb = { label: "Models", href: `${appPath}/models` };
    if (id === "new") return [modelsCrumb, { label: "New model" }];
    const model = models.find((item) => item.id === id);
    return model ? [modelsCrumb, { label: model.name }] : [modelsCrumb];
  }

  if (section === "assets") {
    const assetsCrumb = { label: "Assets", href: `${appPath}/assets` };
    if (id === "new") return [assetsCrumb, { label: "Upload" }];
    return [assetsCrumb, ...(id ? titleCrumb : [])];
  }

  return [{ label: "Dashboard" }];
}
