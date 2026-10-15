import { Skeleton } from "@/components/ui/skeleton";

// Skeletons mirror the real layouts so content settles in place instead of jumping when it loads.

export function WorkbenchShellFallback({ label = "Loading workbench" }: { label?: string }) {
  return (
    <div className="min-h-dvh bg-background text-foreground lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]" aria-label={label} aria-busy="true">
      <aside className="hidden h-dvh flex-col gap-2 border-r border-sidebar-border bg-sidebar p-3 lg:flex">
        <Skeleton className="h-12 w-full bg-sidebar-accent" />
        <div className="mt-2 space-y-2 px-1">
          <Skeleton className="h-6 w-3/4 bg-sidebar-accent" />
          <Skeleton className="h-6 w-2/3 bg-sidebar-accent" />
          <Skeleton className="h-6 w-1/2 bg-sidebar-accent" />
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex h-(--workbench-header) items-center border-b px-4 sm:px-6 lg:px-8">
          <Skeleton className="h-4 w-48" />
        </header>
        <div className="p-4 sm:p-6 lg:p-8">
          <WorkbenchPageFallback />
        </div>
      </div>
    </div>
  );
}

export function WorkbenchPageFallback({ label = "Loading content" }: { label?: string }) {
  return (
    <div className="rounded-xl border bg-card p-6" aria-label={label} aria-busy="true">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="mt-3 h-4 w-full max-w-xl" />
      <div className="mt-6 space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-4/5" />
      </div>
    </div>
  );
}

export function DashboardFallback() {
  return (
    <div className="grid gap-6" aria-label="Loading dashboard" aria-busy="true">
      <Skeleton className="h-16 w-full rounded-xl" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <ListCardFallback rows={8} />
        <div className="grid content-start gap-6">
          <ListCardFallback rows={3} />
          <ListCardFallback rows={1} />
        </div>
      </div>
    </div>
  );
}

export function EntriesWorkspaceFallback() {
  return (
    <div className="grid gap-6 xl:h-[calc(100dvh-var(--workbench-header)-4rem)] xl:grid-cols-[20rem_minmax(0,1fr)]" aria-label="Loading entries" aria-busy="true">
      <EntryListFallback />
      <EntryEditorFallback />
    </div>
  );
}

export function EntryListFallback() {
  return (
    <div className="flex flex-col rounded-xl border bg-card">
      <div className="space-y-2 border-b p-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
      <div className="space-y-1 p-2">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="space-y-1.5 px-3 py-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function EntryEditorFallback() {
  return (
    <div className="flex flex-col rounded-xl border bg-card" aria-label="Loading entry" aria-busy="true">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6">
        <Skeleton className="h-8 w-40" />
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}

export function AssetsFallback() {
  return (
    <div className="rounded-xl border bg-card p-4" aria-label="Loading assets" aria-busy="true">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="mt-4 h-8 w-full" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="aspect-[4/3] w-full rounded-xl" />)}
      </div>
    </div>
  );
}

export function ModelsFallback() {
  return (
    <div className="grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]" aria-label="Loading models" aria-busy="true">
      <div className="hidden xl:block"><ListCardFallback rows={8} /></div>
      <WorkbenchPageFallback label="Loading model" />
    </div>
  );
}

function ListCardFallback({ rows }: { rows: number }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <Skeleton className="h-5 w-40" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: rows }, (_, index) => <Skeleton key={index} className="h-8 w-full" />)}
      </div>
    </div>
  );
}
