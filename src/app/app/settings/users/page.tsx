import { Suspense } from "react";

import { UsersPanel } from "@/components/workbench/users-panel";
import { WorkbenchPageFallback } from "@/components/workbench/workbench-loading";
import { getCmsPageData } from "@/lib/cms/ssr";

export default function SettingsUsersPage() {
  return (
    <Suspense fallback={<WorkbenchPageFallback label="Loading users" />}>
      <SettingsUsersContent />
    </Suspense>
  );
}

async function SettingsUsersContent() {
  const data = await getCmsPageData({ view: "users" });

  return <UsersPanel currentUserId={data.me.user.id} tenants={data.tenants} users={data.users} />;
}
