import { Skeleton } from "@/components/ui/skeleton";

export function WorkbenchShellFallback({ label = "Loading workbench" }: { label?: string }) {
  return (
    <main className="min-h-screen bg-background text-foreground" aria-label={label}>
      <div className="grid min-h-screen lg:grid-cols-[17rem_1fr]">
        <aside className="hidden border-r bg-sidebar p-5 lg:block">
          <Skeleton className="h-11 w-full" />
          <div className="mt-8 space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-4/5" />
            <Skeleton className="h-9 w-3/4" />
          </div>
        </aside>
        <section className="min-w-0">
          <header className="border-b px-4 py-4 sm:px-6 lg:px-8">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="mt-2 h-8 w-56" />
          </header>
          <div className="p-4 sm:p-6 lg:p-8">
            <WorkbenchPageFallback />
          </div>
        </section>
      </div>
    </main>
  );
}

export function WorkbenchPageFallback({ label = "Loading content" }: { label?: string }) {
  return (
    <div className="grid gap-6" aria-label={label}>
      <div className="rounded-[var(--radius-lg)] border bg-card p-6">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="mt-3 h-4 w-full max-w-2xl" />
        <Skeleton className="mt-2 h-4 w-3/5" />
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      </div>
    </div>
  );
}
