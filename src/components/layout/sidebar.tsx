"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardCheck, Settings, Target, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

// Three operating surfaces and Settings (the operating shell, 16 September;
// DEV-011). The stated goal is to spend LESS time here — every extra
// destination is a place to get lost on the way to finding a client.
//
// What left, and where it went. None of the data moved and no page was
// deleted; the list is hidden, the record still opens from the case.
//   Workforce      → Settings → Team (DEV-012). `/agents` redirects.
//   Signal Inbox   → Settings → Diagnostics. Scout consumes signals; a project
//                    still opens from its mission, Today and a case.
//   Cert Alerts    → certificate exceptions on Today, and a filter in Talent.
//   Compliance     → a tab in Talent.
//   Setup Readiness, Data Imports → Settings.
//   Tasks, Companies, Job Intake left earlier for the same reason.
const navItems: NavItem[] = [
  { href: "/decisions", label: "Today", icon: ClipboardCheck },
  { href: "/missions", label: "Missions", icon: Target },
  { href: "/workers", label: "Talent", icon: UserRound },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  approvalsCount = 0,
  missionsCount = 0,
}: {
  approvalsCount?: number;
  /** Missions that asked something, finished since you looked, or stopped. */
  missionsCount?: number;
}) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-50 lg:flex">
      <div className="border-b border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-black tracking-tight text-slate-900">
          Triangle<span className="text-sky-600">OS</span>
        </h1>
        <p className="mt-1 text-[11px] font-medium text-slate-500 uppercase tracking-wider">Project to Placement</p>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            // A live count beats a static label: work waiting on a human has
            // to be visible from anywhere in the app.
            const live =
              item.href === "/decisions"
                ? approvalsCount
                : item.href === "/missions"
                  ? missionsCount
                  : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  active
                    ? "bg-white text-sky-700 shadow-sm border border-slate-200"
                    : "text-slate-600 hover:bg-slate-200 hover:text-slate-900",
                )}
              >
                <Icon className={cn("h-4 w-4", active ? "text-sky-600" : "")} />
                <span className="flex-1">{item.label}</span>
                {live > 0 && (
                  <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
                    {live}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
