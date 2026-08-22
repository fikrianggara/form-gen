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
            className="flex items-center gap-2 font-bold text-gray-900"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 font-bold text-white shadow-sm">
              F
            </div>
            <span className="text-lg tracking-tight">FormGen</span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 lg:hidden"
            aria-label="Close sidebar"
          >
            <IconX size={20} />
          </button>
        </div>

        {/* Navigation Groups */}
        <nav className="space-y-5 px-1">
          {groups.map((group) => (
            <div key={group.id} className="space-y-1">
              {group.title && (
                <div className="px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
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
                          ? "bg-indigo-50 text-indigo-700 font-semibold"
                          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      }`}
                    >
                      <span className={active ? "text-indigo-600" : "text-gray-400"}>
                        {renderNavIcon(item.iconName)}
                      </span>
                      <span>{item.label}</span>
                      {item.badge && (
                        <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
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
      <div className="border-t border-gray-200 pt-4 px-2 space-y-3">
        <div className="flex items-center justify-between px-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-900">{user.name}</p>
            <p className="truncate text-xs text-gray-500">{user.email}</p>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
              user.role === "ADMIN"
                ? "bg-purple-100 text-purple-700"
                : user.role === "DEV"
                ? "bg-blue-100 text-blue-700"
                : "bg-gray-100 text-gray-700"
            }`}
          >
            {user.role}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-center text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Public site
          </Link>
          <form action={logoutAction} className="inline-block">
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
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
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col lg:flex-row">
      {/* Mobile Header */}
      <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 lg:hidden">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-100"
            aria-label="Open sidebar"
          >
            <IconMenu size={20} />
          </button>
          <Link href="/dashboard" className="font-bold text-gray-900">
            FormGen
          </Link>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${
            user.role === "ADMIN"
              ? "bg-purple-100 text-purple-700"
              : user.role === "DEV"
              ? "bg-blue-100 text-blue-700"
              : "bg-gray-100 text-gray-700"
          }`}
        >
          {user.role}
        </span>
      </header>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 transform bg-white p-4 shadow-xl transition-transform duration-200 ease-in-out lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {navContent}
      </aside>

      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-gray-200 bg-white p-4">
        {navContent}
      </aside>

      {/* Main Content Viewport */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
