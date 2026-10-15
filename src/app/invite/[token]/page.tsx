import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AcceptInviteForm } from "@/components/auth/accept-invite-form";
import { AuthPageShell } from "@/components/auth/login-client";
import { getInviteForToken } from "@/modules/invites/service";

type InvitePageProps = { params: Promise<{ token: string }> };

export default function InvitePage({ params }: InvitePageProps) {
  return (
    <Suspense fallback={<InviteFallback />}>
      <InviteContent params={params} />
    </Suspense>
  );
}

const closedMessages = {
  accepted: "This invite link has already been used. If it was yours, sign in with the email and password you chose.",
  revoked: "This invite link was withdrawn. Ask an administrator for a new one.",
  expired: "This invite link has expired. Ask an administrator for a new one.",
  invalid: "This invite link isn’t valid. Check that you copied the whole link, or ask an administrator for a new one.",
};

async function InviteContent({ params }: InvitePageProps) {
  await connection();
  const { token } = await params;
  const invite = await getInviteForToken(token);

  if (invite.status !== "pending") {
    return (
      <AuthPageShell title="Invite unavailable" description={closedMessages[invite.status]}>
        <Button asChild className="w-full"><Link href="/login">Go to sign in</Link></Button>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell title="Create your account" description="You’ve been invited to the CMS. Choose your name and a password to get started.">
      <AcceptInviteForm token={token} email={invite.email} />
    </AuthPageShell>
  );
}

function InviteFallback() {
  return (
    <AuthPageShell title="Create your account" description="Checking your invite link…">
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    </AuthPageShell>
  );
}
