"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconDashboard,
  IconFileText,
  IconPlus,
  IconSparkles,
  IconDatabase,
  IconList,
  IconKey,
  IconBuilding,
  IconUsers,
  IconLogOut,
  IconMenu,
  IconX,
} from "@/components/icons";
import { getNavigationGroups, type Role, type NavigationItem } from "@/lib/navigation";
import { logoutAction } from "@/lib/actions/auth";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

interface AppShellProps {
  user: {
    name: string;
    email: string;
    role: Role;
  };
  children: React.ReactNode;
}

function renderNavIcon(name: string, size = 18) {
  switch (name) {
    case "dashboard":
      return <IconDashboard size={size} />;
    case "proposals":
      return <IconFileText size={size} />;
    case "plus":
      return <IconPlus size={size} />;
    case "sparkles":
      return <IconSparkles size={size} />;
    case "database":
      return <IconDatabase size={size} />;
    case "list":
      return <IconList size={size} />;
    case "key":
      return <IconKey size={size} />;
    case "building":
      return <IconBuilding size={size} />;
    case "users":
      return <IconUsers size={size} />;
    default:
      return <IconFileText size={size} />;
  }
}

export function AppShell({ user, children }: AppShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const groups = getNavigationGroups(user.role);

  const isItemActive = (item: NavigationItem) => {
    if (item.exact) {
      return pathname === item.href;
    }
    return pathname.startsWith(item.href);
  };

  const navContent = (
    <div className="flex h-full flex-col justify-between">
      <div className="space-y-6">
        {/* Brand */}
        <div className="flex items-center justify-between px-3 py-2">
          <Link
            href="/dashboard"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2.5 font-bold text-foreground"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 font-bold text-white shadow-sm">
              F
            </div>
            <span className="text-lg tracking-tight font-semibold">FormGen</span>
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle className="lg:hidden" />
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted lg:hidden"
              aria-label="Close sidebar"
            >
              <IconX size={20} />
            </button>
          </div>
        </div>

        {/* Navigation Groups */}
        <nav className="space-y-5 px-1">
          {groups.map((group) => (
            <div key={group.id} className="space-y-1">
              {group.title && (
                <div className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {group.title}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isItemActive(item);
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-semibold"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <span className={active ? "text-indigo-600 dark:text-indigo-400" : "text-muted-foreground/80"}>
                        {renderNavIcon(item.iconName)}
                      </span>
                      <span>{item.label}</span>
                      {item.badge && (
                        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      {/* Footer / User Profile & Logout */}
      <div className="border-t border-border pt-4 px-2 space-y-3">
        <div className="flex items-center justify-between px-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
              user.role === "ADMIN"
                ? "bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300"
                : user.role === "DEV"
                ? "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {user.role}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="flex-1 rounded-lg border border-border px-2.5 py-1.5 text-center text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Public site
          </Link>
          <ThemeToggle className="hidden lg:inline-flex" />
          <form action={logoutAction} className="inline-block">
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-900"
              title="Sign out"
            >
              <IconLogOut size={14} />
              <span>Exit</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col lg:flex-row">
      {/* Mobile Header */}
      <header className="flex h-16 items-center justify-between border-b border-border bg-card px-4 lg:hidden">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
            aria-label="Open sidebar"
          >
            <IconMenu size={20} />
          </button>
          <Link href="/dashboard" className="font-bold text-foreground">
            FormGen
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${
              user.role === "ADMIN"
                ? "bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300"
                : user.role === "DEV"
                ? "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {user.role}
          </span>
        </div>
      </header>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 transform bg-card p-4 shadow-xl border-r border-border transition-transform duration-200 ease-in-out lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {navContent}
      </aside>

      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-border bg-card p-4">
        {navContent}
      </aside>

      {/* Main Content Viewport */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
