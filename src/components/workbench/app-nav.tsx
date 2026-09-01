"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Boxes, Building2, ChevronsUpDown, FileText, ImageIcon, LayoutDashboard, LogOut } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { authClient } from "@/lib/auth/client";
import type { TenantMembership } from "@/lib/cms/types";
import { cn } from "@/lib/utils";
import { switchTenantAction } from "./actions";

type AppNavProps = {
  memberships: TenantMembership[];
  selectedTenantId?: string;
  tenantSlug?: string;
  tenantMenuName: string;
};

export function AppNav({ memberships, selectedTenantId, tenantSlug, tenantMenuName }: AppNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const appPath = tenantSlug ? `/app/${tenantSlug}` : "/app";

  const links = navLinks(appPath, Boolean(tenantSlug));

  function selectTenant(tenantId: string) {
    if (tenantId === selectedTenantId) {
      const membership = memberships.find((item) => item.tenantId === tenantId);
      if (membership) router.push(`/app/${membership.tenant.slug}`);
      return;
    }

    startTransition(async () => {
      try {
        const result = await switchTenantAction(tenantId);
        router.push(`/app/${result.membership.tenant.slug}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Tenant could not be switched");
      }
    });
  }

  function signOut() {
    startTransition(async () => {
      await authClient.signOut();
      router.replace("/login");
    });
  }

  return (
    <>
      <aside className="hidden border-r bg-sidebar text-sidebar-foreground lg:flex lg:flex-col">
        <div className="p-5">
          <TenantSelector
            isPending={isPending}
            memberships={memberships}
            selectedTenantId={selectedTenantId}
            tenantMenuName={tenantMenuName}
            onSelectTenant={selectTenant}
          />
        </div>
        <Separator />
        <nav className="flex flex-1 flex-col gap-1 p-3 text-sm">
          {links.map((item) => (
            <NavLink key={item.href} href={item.href} active={item.isActive(pathname)}>
              <item.icon /> {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3">
          <Button variant="secondary" className="w-full" onClick={signOut} disabled={isPending}>
            <LogOut data-icon="inline-start" /> Sign out
          </Button>
        </div>
      </aside>

      <div className="border-b p-4 lg:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline">Menu</Button>
          </SheetTrigger>
          <SheetContent side="left">
            <SheetHeader>
              <SheetTitle>CMS sections</SheetTitle>
              <SheetDescription>Jump to tenant, model, entry, and asset tools.</SheetDescription>
            </SheetHeader>
            <div className="mt-6">
              <TenantSelector
                isPending={isPending}
                memberships={memberships}
                selectedTenantId={selectedTenantId}
                tenantMenuName={tenantMenuName}
                onSelectTenant={selectTenant}
              />
            </div>
            <nav className="mt-6 flex flex-col gap-2">
              {links.map((item) => (
                <Link key={item.href} href={item.href} className="rounded-lg px-3 py-2 hover:bg-muted">
                  {item.label}
                </Link>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}

function TenantSelector({
  isPending,
  memberships,
  selectedTenantId,
  tenantMenuName,
  onSelectTenant,
}: {
  isPending: boolean;
  memberships: TenantMembership[];
  selectedTenantId?: string;
  tenantMenuName: string;
  onSelectTenant: (tenantId: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-auto w-full justify-start p-2" disabled={isPending}>
          <span className="grid size-9 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
            <LayoutDashboard />
          </span>
          <span className="min-w-0 flex-1 truncate text-left font-semibold">{tenantMenuName}</span>
          <ChevronsUpDown className="ml-auto text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          {memberships.length ? (
            <DropdownMenuRadioGroup value={selectedTenantId}>
              {memberships.map((membership) => (
                <DropdownMenuRadioItem
                  key={membership.tenantId}
                  value={membership.tenantId}
                  onSelect={() => onSelectTenant(membership.tenantId)}
                >
                  <Building2 />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{membership.tenant.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">/{membership.tenant.slug}</span>
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          ) : (
            <DropdownMenuItem disabled>No workspaces available</DropdownMenuItem>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-sidebar-accent", active && "bg-sidebar-accent")}>
      {children}
    </Link>
  );
}

function navLinks(appPath: string, hasTenant: boolean) {
  return [
    ...(hasTenant
      ? [
          { href: `${appPath}/models`, label: "Models", icon: Boxes, isActive: (pathname: string) => pathname.startsWith(`${appPath}/models`) },
          { href: `${appPath}/entries`, label: "Entries", icon: FileText, isActive: (pathname: string) => pathname.startsWith(`${appPath}/entries`) },
          { href: `${appPath}/assets`, label: "Assets", icon: ImageIcon, isActive: (pathname: string) => pathname.startsWith(`${appPath}/assets`) },
        ]
      : []),
  ];
}
