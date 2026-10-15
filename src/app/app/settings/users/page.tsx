import { Suspense } from "react";

import { InvitesPanel } from "@/components/workbench/invites-panel";
import { UsersPanel } from "@/components/workbench/users-panel";
import { WorkbenchPageFallback } from "@/components/workbench/workbench-loading";
import { getCmsPageData } from "@/lib/cms/ssr";
import { listInvites } from "@/modules/invites/service";

export default function SettingsUsersPage() {
  return (
    <Suspense fallback={<WorkbenchPageFallback label="Loading users" />}>
      <SettingsUsersContent />
    </Suspense>
  );
}

async function SettingsUsersContent() {
  const data = await getCmsPageData({ view: "users" });
  const invites = await listInvites();

  return (
    <>
      <UsersPanel currentUserId={data.me.user.id} tenants={data.tenants} users={data.users} />
      <InvitesPanel invites={invites} tenants={data.tenants} />
    </>
  );
}
