import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="min-h-screen overflow-hidden bg-background px-5 py-6 text-foreground sm:px-8 lg:px-12">
      <main className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-7xl gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="relative flex flex-col justify-between overflow-hidden rounded-[var(--radius-lg)] border border-line bg-card p-7 shadow-[0_30px_80px_rgba(50,38,24,0.13)] sm:p-10 lg:p-12">
          <div className="absolute -right-28 -top-28 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
          <div className="absolute bottom-12 right-10 hidden h-40 w-40 rotate-12 border border-foreground/15 lg:block" />
          <div className="relative flex items-center justify-between gap-4">
            <p className="rounded-full border border-line bg-background/70 px-4 py-2 text-sm font-medium text-muted">
              Headed CMS v1
            </p>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted">Tenant scoped</p>
          </div>

          <div className="relative mt-24 max-w-3xl lg:mt-36">
            <h1 className="text-balance text-5xl font-semibold tracking-[-0.055em] text-foreground sm:text-7xl lg:text-8xl">
              Structured content with a real CMS head.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-muted sm:text-xl">
              Manage tenants, models, entries, publishing, and assets from server-rendered Next.js
              screens backed directly by Better Auth, Drizzle, Postgres, and tenant-aware CMS services.
            </p>
          </div>

          <div className="relative mt-12 grid gap-3 sm:grid-cols-3">
            {[
              ["SSR", "Modern App Router pages fetch CMS data on the server"],
              ["Tenancy", "Active workspace selection with membership checks"],
              ["Editorial", "Model, entry, publishing, and asset workflows"],
            ].map(([title, description]) => (
              <article key={title} className="rounded-[var(--radius-md)] border border-line bg-background/60 p-5">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">{title}</h2>
                <p className="mt-3 text-sm leading-6 text-muted">{description}</p>
              </article>
            ))}
          </div>

          <div className="relative mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/app">Open workbench</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </section>

        <aside className="grid gap-6">
          <section className="rounded-[var(--radius-lg)] bg-foreground p-7 text-background sm:p-8">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-background/55">Start here</p>
            <div className="mt-8 space-y-4 text-sm leading-6 text-background/80">
              <p>
                Add real values to <code className="text-accent-ink">.env.local</code>, then run the
                migration and start the dev server.
              </p>
              <pre className="overflow-x-auto rounded-2xl bg-black/25 p-4 font-mono text-xs text-accent-ink">
{`npm run db:migrate
npm run dev`}
              </pre>
            </div>
          </section>

          <section className="rounded-[var(--radius-lg)] border border-line bg-card p-7 sm:p-8">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted">CMS workflows</p>
            <ul className="mt-6 space-y-3 text-sm text-ink-soft">
              {[
                "Create and switch tenant workspaces",
                "Design models and reusable fields",
                "Draft, edit, publish, and unpublish entries",
                "Upload tenant assets with direct S3 POSTs",
                "Preview image assets through short-lived S3 URLs",
              ].map((workflow) => (
                <li key={workflow} className="rounded-2xl border border-line bg-background/60 px-4 py-3 text-sm">
                  {workflow}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </main>
    </div>
  );
}
