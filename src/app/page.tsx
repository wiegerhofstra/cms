import { LoginForm } from "@/components/auth/login-client";
import { SignedOutOnly } from "@/components/auth/signed-out-only";
import { FanOutDemo } from "@/components/landing/fan-out-demo";

export default function Home() {
  return (
    <SignedOutOnly>
      <HomeContent />
    </SignedOutOnly>
  );
}

function HomeContent() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="mx-auto w-full max-w-6xl px-5 py-5 sm:px-8">
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">C</span>
          CMS
        </span>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-5 pt-6 pb-16 sm:px-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-20">
        <section>
          <h1 className="max-w-xl text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl">
            Edit once. Every site updates.
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted-foreground">
            One place for the content of every website you run.{" "}
            <span className="hidden sm:inline">Change the title below and watch each site pick it up in its own style.</span>
          </p>
          <FanOutDemo className="mt-12 hidden sm:grid" />
        </section>

        <section aria-labelledby="signin-heading">
          <h2 id="signin-heading" className="text-2xl font-semibold">Sign in</h2>
          <p className="mt-1 text-sm text-muted-foreground">Use the email address and password for your account.</p>
          <div className="mt-6 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
            <LoginForm />
          </div>
        </section>
      </main>
    </div>
  );
}
