"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Braces, Building2, KeyRound, Mail, RefreshCw, Users } from "lucide-react";

import { cn } from "@/lib/utils";

export const settingsLinks = [
  { href: "/app/settings/users", label: "Users", icon: Users },
  { href: "/app/settings/tenants", label: "Tenants", icon: Building2 },
  { href: "/app/settings/auth", label: "Auth", icon: KeyRound },
  { href: "/app/settings/email", label: "Email", icon: Mail },
  { href: "/app/settings/revalidation", label: "Revalidation", icon: RefreshCw },
  { href: "/app/settings/api", label: "API", icon: Braces },
];

export function SettingsTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Settings" className="-mb-px flex gap-1 overflow-x-auto border-b">
      {settingsLinks.map((item) => {
        const isActive = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 [&_svg]:size-4",
              isActive && "border-primary font-medium text-foreground [&_svg]:text-primary",
            )}
          >
            <item.icon /> {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
