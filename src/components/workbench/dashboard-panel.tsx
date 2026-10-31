import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardData, DashboardEntry, WorkbenchShell } from "@/lib/cms/types";
import { RelativeTime, StatusDot } from "./entry-status";

export function DashboardPanel({ tenantSlug, shell, dashboard }: { tenantSlug: string; shell: WorkbenchShell; dashboard: DashboardData }) {
  const appPath = `/app/${tenantSlug}`;
  const modelNames = new Map(shell.models.map((model) => [model.id, model.name]));
  const contentModels = shell.models
    .filter((model) => model.kind === "content" && model.status === "active")
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="grid gap-6">
      {contentModels.length ? (
        <section aria-labelledby="new-entry-heading" className="flex flex-wrap items-center gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <h2 id="new-entry-heading" className="mr-2 text-sm font-medium">New entry</h2>
          {contentModels.map((model) => (
            <Button key={model.id} asChild size="sm" variant="outline">
              <Link href={`${appPath}/entries/${model.id}/new`}><Plus data-icon="inline-start" /> {model.name}</Link>
            </Button>
          ))}
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="self-start">
          <CardHeader>
            <CardTitle>Recently edited</CardTitle>
            <CardDescription>{dashboard.entryCount} {dashboard.entryCount === 1 ? "entry" : "entries"} in this workspace</CardDescription>
          </CardHeader>
          <CardContent className="px-2">
            {dashboard.recentEntries.length ? (
              <DashboardEntryList appPath={appPath} entries={dashboard.recentEntries} modelNames={modelNames} />
            ) : (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">Nothing has been edited yet. Create an entry to get started.</p>
            )}
          </CardContent>
        </Card>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Drafts</CardTitle>
              <CardDescription>{dashboard.draftCount ? `${dashboard.draftCount} not published yet` : "Everything is published."}</CardDescription>
            </CardHeader>
            {dashboard.drafts.length ? (
              <CardContent className="px-2">
                <DashboardEntryList appPath={appPath} entries={dashboard.drafts} modelNames={modelNames} />
              </CardContent>
            ) : null}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Website</CardTitle>
              <CardDescription>
                {shell.revalidation.consumerType === "astro" ? (
                  shell.revalidation.lastRevalidatedAt
                    ? <>Last build queued <RelativeTime value={shell.revalidation.lastRevalidatedAt} />. Check Coolify for deployment status.</>
                    : shell.revalidation.configured ? "Ready to rebuild. Click Rebuild after publishing your changes." : "Configure Coolify builds to update this static website."
                ) : shell.revalidation.configured
                  ? shell.revalidation.lastRevalidatedAt
                    ? <>Last revalidated <RelativeTime value={shell.revalidation.lastRevalidatedAt} /></>
                    : "Not revalidated from the CMS yet."
                  : "Revalidation isn’t set up, so the website refreshes on its own schedule."}
              </CardDescription>
              {shell.revalidation.lastDeploymentId ? <p className="break-all text-xs text-muted-foreground">Coolify deployment: {shell.revalidation.lastDeploymentId}</p> : null}
            </CardHeader>
            {!shell.revalidation.configured && shell.me.user.role === "admin" ? (
              <CardContent>
                <Button asChild variant="outline"><Link href="/app/settings/revalidation">Set up website updates</Link></Button>
              </CardContent>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}

function DashboardEntryList({ appPath, entries, modelNames }: { appPath: string; entries: DashboardEntry[]; modelNames: Map<string, string> }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {entries.map((entry) => (
        <li key={entry.id}>
          <Link
            href={`${appPath}/entries/${entry.modelId}/${entry.id}`}
            className="flex min-w-0 items-center gap-3 rounded-lg px-2 py-2 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <StatusDot status={entry.status} />
            <span className="min-w-0 flex-1 truncate font-medium">{entry.title}</span>
            <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{modelNames.get(entry.modelId)}</span>
            <RelativeTime className="w-20 shrink-0 text-right text-xs text-muted-foreground" value={entry.updatedAt} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
