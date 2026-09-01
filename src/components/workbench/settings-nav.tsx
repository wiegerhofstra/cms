"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Check, KeyRound, Settings, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const settingsLinks = [
  { href: "/app/settings/users", label: "Users", icon: Users },
  { href: "/app/settings/tenants", label: "Tenants", icon: Building2 },
  { href: "/app/settings/auth", label: "Auth", icon: KeyRound },
];

export function SettingsMenu() {
  const pathname = usePathname();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Open settings menu">
          <Settings />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Settings</DropdownMenuLabel>
          {settingsLinks.map((item) => {
            const isActive = pathname.startsWith(item.href);

            return (
              <DropdownMenuItem key={item.href} asChild>
                <Link href={item.href} aria-current={isActive ? "page" : undefined}>
                  <item.icon />
                  {item.label}
                  {isActive ? <Check className="ml-auto" /> : null}
                </Link>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
