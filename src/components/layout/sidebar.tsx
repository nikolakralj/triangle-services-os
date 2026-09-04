"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  ClipboardCheck,
  FileText,
  Cpu,
  Gauge,
  Inbox,
  Radar,
  Settings,
  ShieldAlert,
  Upload,
  UserRound,
  ListChecks,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
  highlight?: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

// Ordered by how often a person should need it, not by how the data is
// modelled. The stated goal is to spend LESS time here — every extra
// destination is a place to get lost on the way to finding a client, so the
// two screens that answer "what needs me" and "where does the company stop"
// come first and everything else is filed under what it is: reference.
//
// Tasks was removed rather than demoted. Workforce assignments are the work
// object; a second task list beside them is two answers to one question.
const navGroups: NavGroup[] = [
  {
    label: "Every day",
    items: [
      { href: "/decisions", label: "Decision Inbox", icon: ClipboardCheck },
      { href: "/dashboard", label: "Overview", icon: Gauge },
      { href: "/agents", label: "Workforce", icon: Cpu },
    ],
  },
  {
    label: "What we found",
    items: [
      { href: "/hunter", label: "Signal Inbox", icon: Radar },
      { href: "/companies", label: "Companies", icon: Building2 },
      { href: "/job-intake", label: "Job Intake", icon: Inbox, badge: "LEADS" },
    ],
  },
  {
    label: "Our people",
    items: [
      { href: "/workers", label: "Talent Pool", icon: UserRound },
      { href: "/workers/cert-checklist", label: "Cert Alerts", icon: ShieldAlert },
      { href: "/documents", label: "Compliance", icon: FileText },
    ],
  },
  {
    label: "Setup",
    items: [
      { href: "/onboarding", label: "Setup Readiness", icon: ListChecks },
      { href: "/imports", label: "Data Imports", icon: Upload },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function Sidebar({ approvalsCount = 0 }: { approvalsCount?: number }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-50 lg:flex">
      <div className="border-b border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-black tracking-tight text-slate-900">
          Triangle<span className="text-sky-600">OS</span>
        </h1>
        <p className="mt-1 text-[11px] font-medium text-slate-500 uppercase tracking-wider">Project to Placement</p>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {navGroups.map((group) => (
          <div key={group.label}>
            <h3 className="mb-2 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {group.label}
            </h3>
            <nav className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname.startsWith(item.href));
                const highlight = item.highlight;
                // A live count beats a static label: work waiting on a human
                // has to be visible from anywhere in the app, not only once
                // you've opened the right project.
                const pending = item.href === "/decisions" && approvalsCount > 0;
                const badge = pending ? String(approvalsCount) : item.badge;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                      active
                        ? highlight
                          ? "bg-sky-600 text-white shadow-md shadow-sky-200"
                          : "bg-white text-sky-700 shadow-sm border border-slate-200"
                        : highlight
                          ? "bg-sky-50 text-sky-800 hover:bg-sky-100 border border-sky-100"
                          : "text-slate-600 hover:bg-slate-200 hover:text-slate-900",
                    )}
                  >
                    <Icon className={cn("h-4 w-4", active && !highlight ? "text-sky-600" : "")} />
                    <span className="flex-1">{item.label}</span>
                    {badge && (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                          active && highlight
                            ? "bg-white/20 text-white"
                            : pending
                              ? "bg-amber-500 text-white shadow-sm"
                              : "bg-sky-500 text-white shadow-sm",
                        )}
                      >
                        {badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </div>
    </aside>
  );
}
