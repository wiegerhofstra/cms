import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function NoActiveTenantCard({ isAdmin }: { isAdmin: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>No tenant access</CardTitle>
        <CardDescription>
          {isAdmin
            ? "Create a workspace before using models, entries, and assets."
            : "Ask an administrator to add you to a tenant before using the CMS workspace."}
        </CardDescription>
      </CardHeader>
      {isAdmin ? (
        <CardContent>
          <Button asChild>
            <Link href="/app/settings/tenants">Create tenant</Link>
          </Button>
        </CardContent>
      ) : null}
    </Card>
  );
}
