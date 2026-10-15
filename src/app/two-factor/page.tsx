import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { Skeleton } from "@/components/ui/skeleton";
import { AuthPageShell } from "@/components/auth/login-client";
import { TwoFactorManage, TwoFactorSetup } from "@/components/auth/two-factor-setup";
import { auth } from "@/lib/auth/server";

export default function TwoFactorPage() {
  return (
    <Suspense fallback={<TwoFactorFallback />}>
      <TwoFactorContent />
    </Suspense>
  );
}

async function TwoFactorContent() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const twoFactorEnabled = session.user.twoFactorEnabled === true;
  const twoFactorRequired = session.user.twoFactorRequired === true;

  if (twoFactorEnabled) {
    return (
      <AuthPageShell title="Two-factor authentication" description="Your account asks for a code from your authenticator app when you sign in.">
        <TwoFactorManage required={twoFactorRequired} />
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell
      title="Set up two-factor authentication"
      description={
        twoFactorRequired
          ? "Your account needs a second sign-in step. Connect an authenticator app to continue."
          : "Add a second sign-in step by connecting an authenticator app."
      }
    >
      <TwoFactorSetup required={twoFactorRequired} />
    </AuthPageShell>
  );
}

function TwoFactorFallback() {
  return (
    <AuthPageShell title="Two-factor authentication" description="Loading your account…">
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    </AuthPageShell>
  );
}
