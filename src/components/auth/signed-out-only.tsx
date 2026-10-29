import { Suspense, type ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/server";

export function SignedOutOnly({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-dvh place-items-center bg-background text-muted-foreground" aria-busy="true">
          <p role="status">Loading…</p>
        </main>
      }
    >
      <SessionCheck>{children}</SessionCheck>
    </Suspense>
  );
}

async function SessionCheck({ children }: { children: ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (session) redirect("/app");

  return children;
}
