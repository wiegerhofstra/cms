import Link from "next/link";

import { Button } from "@/components/ui/button";

const workflows = [
  "Define models with the fields each website needs",
  "Write and publish entries in a focused editor",
  "Upload images and files once, reuse them anywhere",
  "Deliver content to every site through one API",
];

export default function Home() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">C</span>
          CMS
        </span>
        <Button asChild variant="ghost">
          <Link href="/login">Sign in</Link>
        </Button>
      </header>

      <main className="mx-auto grid max-w-6xl items-center gap-12 px-5 pt-10 pb-20 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:pt-20">
        <section>
          <h1 className="max-w-xl text-4xl leading-[1.1] font-semibold text-balance sm:text-5xl">
            Structured content for every website you run.
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted-foreground">
            Model your content once, write it in a calm editor, and publish it to each site through the content API.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/app">Open workbench</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
          <ul className="mt-10 grid max-w-lg gap-2 text-sm text-muted-foreground">
            {workflows.map((workflow) => (
              <li key={workflow} className="flex gap-3">
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                {workflow}
              </li>
            ))}
          </ul>
        </section>

        <EditorPreview />
      </main>

      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-5 py-8 text-sm text-muted-foreground sm:px-8">
          <p>
            Running locally? Add your values to <code className="font-mono text-foreground">.env.local</code>, then run{" "}
            <code className="font-mono text-foreground">npm run db:migrate</code> and <code className="font-mono text-foreground">npm run dev</code>.
          </p>
        </div>
      </footer>
    </div>
  );
}

/** A static picture of the entry editor, so the first thing people see is what they'll work in. */
function EditorPreview() {
  return (
    <div aria-hidden className="overflow-hidden rounded-xl bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04),0_12px_32px_-12px_rgb(0_0_0/0.12)] ring-1 ring-foreground/10">
      <div className="flex items-center gap-3 border-b px-5 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-lg leading-tight font-semibold">Knee complaints</p>
          <p className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
            <span>Conditions</span>
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
              <span className="size-2 rounded-full bg-status-draft" /> Draft
            </span>
            <span className="font-medium text-status-draft">Unsaved changes</span>
          </p>
        </div>
        <span className="hidden rounded-lg border border-border px-2.5 py-1 text-sm font-medium sm:inline">Save</span>
        <span className="rounded-lg bg-primary px-2.5 py-1 text-sm font-medium text-primary-foreground">Save and publish</span>
      </div>
      <div className="space-y-4 px-5 py-5">
        <div>
          <p className="text-sm font-medium">Title</p>
          <p className="mt-1.5 rounded-lg border border-input px-2.5 py-1 text-sm">Knee complaints</p>
        </div>
        <div>
          <p className="text-sm font-medium">Slug</p>
          <p className="mt-1.5 rounded-lg border border-input px-2.5 py-1 font-mono text-sm">knee</p>
        </div>
        <div>
          <p className="text-sm font-medium">Content</p>
          <div className="mt-1.5 overflow-hidden rounded-lg border border-ring ring-3 ring-ring/20">
            <div className="flex gap-1.5 border-b bg-muted/60 px-2 py-1.5">
              {["B", "I", "H2", "H3"].map((tool) => (
                <span key={tool} className="grid h-6 min-w-6 place-items-center rounded-sm px-1 text-xs font-semibold text-muted-foreground">{tool}</span>
              ))}
            </div>
            <p className="px-4 py-3 font-serif text-[1.0625rem] leading-[1.7]">
              The knee is the largest joint in the body. Most complaints come from overuse, and a physiotherapist can help you find the cause and plan a treatment that fits.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
