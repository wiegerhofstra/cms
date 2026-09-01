import Link from "next/link";
import { Boxes, FileText, ImageIcon, Settings } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AssetWithPreview, CmsSessionView, ContentModel } from "@/lib/cms/types";

export function DashboardPanel({ tenantSlug, me, models, assets }: { tenantSlug: string; me: CmsSessionView | null; models: ContentModel[]; assets: AssetWithPreview[] }) {
  const appPath = `/app/${tenantSlug}`;

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Dashboard</CardTitle>
          <CardDescription>Quick access to each dedicated CMS workflow route.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {me?.user.role === "admin" ? <QuickRoute href="/app/settings/users" icon={<Settings />} title="Settings" description="Manage users and API access" /> : null}
          <QuickRoute href={`${appPath}/models`} icon={<Boxes />} title="Models" description={`${models.length} models`} />
          <QuickRoute href={`${appPath}/entries`} icon={<FileText />} title="Entries" description="Create and publish content" />
          <QuickRoute href={`${appPath}/assets`} icon={<ImageIcon />} title="Assets" description={`${assets.length} files`} />
        </CardContent>
      </Card>
    </div>
  );
}

function QuickRoute({ href, icon, title, description }: { href: string; icon: ReactNode; title: string; description: string }) {
  return (
    <Link href={href} className="rounded-2xl border bg-card p-4 transition-colors hover:bg-muted">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">{icon}</span>
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </Link>
  );
}
