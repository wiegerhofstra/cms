"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Boxes, Building2, ChevronsUpDown, ImageIcon, LayoutDashboard, LogOut, Menu, Monitor, Moon, Settings, ShieldCheck, Sun } from "lucide-react";
import { useTheme } from "next-themes";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { authClient } from "@/lib/auth/client";
import type { ContentModel, WorkbenchShell } from "@/lib/cms/types";
import { cn } from "@/lib/utils";
import { switchTenantAction } from "./actions";

type SidebarProps = {
  shell: WorkbenchShell;
  onNavigate?: () => void;
};

export function AppSidebar({ shell }: { shell: WorkbenchShell }) {
  return (
    <aside className="hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
      <SidebarContent shell={shell} />
    </aside>
  );
}

export function MobileNav({ shell }: { shell: WorkbenchShell }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="-ml-2 lg:hidden" aria-label="Open navigation"><Menu /></Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SheetDescription className="sr-only">Switch workspace and jump to content, models, assets, and settings.</SheetDescription>
        <SidebarContent shell={shell} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

function SidebarContent({ shell, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const tenantSlug = shell.activeMembership?.tenant.slug;
  const appPath = tenantSlug ? `/app/${tenantSlug}` : null;
  const activeModels = sortByName(shell.models);
  const contentModels = activeModels.filter((model) => model.kind === "content");
  const blockModels = activeModels.filter((model) => model.kind === "block");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-3">
        <TenantSelector shell={shell} />
      </div>
      <nav aria-label="Workbench" className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-4 text-sm [scrollbar-color:var(--sidebar-accent)_transparent] [scrollbar-width:thin]">
        {appPath ? (
          <>
            <NavLink href={appPath} active={pathname === appPath} onNavigate={onNavigate}><LayoutDashboard /> Dashboard</NavLink>
            <NavLink href={`${appPath}/assets`} active={pathname.startsWith(`${appPath}/assets`)} onNavigate={onNavigate}><ImageIcon /> Assets</NavLink>
            <NavLink href={`${appPath}/models`} active={pathname.startsWith(`${appPath}/models`)} onNavigate={onNavigate}><Boxes /> Models</NavLink>
            <ModelSection title="Content" models={contentModels} appPath={appPath} pathname={pathname} onNavigate={onNavigate} />
            <ModelSection title="Blocks" models={blockModels} appPath={appPath} pathname={pathname} onNavigate={onNavigate} />
          </>
        ) : (
          <p className="px-3 py-2 text-muted-foreground">You don’t have access to a workspace yet.</p>
        )}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <UserMenu shell={shell} onNavigate={onNavigate} />
      </div>
    </div>
  );
}

function ModelSection({ title, models, appPath, pathname, onNavigate }: { title: string; models: ContentModel[]; appPath: string; pathname: string; onNavigate?: () => void }) {
  if (!models.length) return null;

  return (
    <div className="mt-5 flex flex-col gap-0.5">
      <h2 className="px-3 pb-1 text-xs font-medium text-muted-foreground">{title}</h2>
      {models.map((model) => {
        const href = `${appPath}/entries/${model.id}`;
        return (
          <NavLink key={model.id} href={href} active={pathname === href || pathname.startsWith(`${href}/`)} onNavigate={onNavigate}>
            <span className={cn("min-w-0 flex-1 truncate", model.status === "archived" && "text-muted-foreground")}>{model.name}</span>
            {model.status === "archived" ? <span className="text-xs text-muted-foreground">Archived</span> : null}
          </NavLink>
        );
      })}
    </div>
  );
}

function NavLink({ href, active, onNavigate, children }: { href: string; active: boolean; onNavigate?: () => void; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-1.5 text-sidebar-foreground outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
        active && "bg-card font-medium text-foreground shadow-xs ring-1 ring-sidebar-border hover:bg-card [&_svg]:text-primary",
      )}
    >
      {children}
    </Link>
  );
}

function TenantSelector({ shell }: { shell: WorkbenchShell }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { memberships } = shell.me;
  const selected = shell.activeMembership;
  const tenantName = selected?.tenant.name ?? "No workspace";

  function selectTenant(tenantId: string) {
    const membership = memberships.find((item) => item.tenantId === tenantId);
    if (!membership) return;
    if (tenantId === selected?.tenantId) {
      router.push(`/app/${membership.tenant.slug}`);
      return;
    }

    startTransition(async () => {
      try {
        const result = await switchTenantAction(tenantId);
        router.push(`/app/${result.membership.tenant.slug}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Workspace could not be switched");
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-auto w-full justify-start gap-3 p-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground" disabled={isPending}>
          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-md bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
            {tenantName.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-left font-semibold">{tenantName}</span>
          <ChevronsUpDown className="ml-auto text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-60" align="start">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          {memberships.length ? (
            <DropdownMenuRadioGroup value={selected?.tenantId}>
              {memberships.map((membership) => (
                <DropdownMenuRadioItem key={membership.tenantId} value={membership.tenantId} onSelect={() => selectTenant(membership.tenantId)}>
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

function UserMenu({ shell, onNavigate }: SidebarProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { user } = shell.me;

  function signOut() {
    startTransition(async () => {
      await authClient.signOut();
      router.replace("/login");
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-auto w-full justify-start gap-3 p-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground" disabled={isPending}>
          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-card text-xs font-semibold ring-1 ring-sidebar-border">{initials(user.name || user.email)}</span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-sm font-medium">{user.name || user.email}</span>
            <span className="block truncate text-xs font-normal text-muted-foreground">{user.email}</span>
          </span>
          <ChevronsUpDown className="ml-auto text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
        {user.role === "admin" ? (
          <>
            <DropdownMenuItem asChild>
              <Link href="/app/settings/users" onClick={onNavigate}><Settings /> Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href="/two-factor" onClick={onNavigate}><ShieldCheck /> Two-factor authentication</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <ThemeOptions />
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut}><LogOut /> Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const themeOptions = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Match system", icon: Monitor },
];

function ThemeOptions() {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>Appearance</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
        {themeOptions.map((option) => (
          // Keep the menu open so the change is visible before it closes.
          <DropdownMenuRadioItem key={option.value} value={option.value} onSelect={(event) => event.preventDefault()}>
            <option.icon /> {option.label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenuGroup>
  );
}

function sortByName(models: ContentModel[]) {
  return [...models].sort((a, b) => Number(a.status === "archived") - Number(b.status === "archived") || a.name.localeCompare(b.name));
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("") || "?";
}
