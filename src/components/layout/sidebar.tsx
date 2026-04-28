"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  BriefcaseBusiness,
  Building2,
  ClipboardCheck,
  FileText,
  Gauge,
  KanbanSquare,
  Radar,
  Settings,
  Upload,
  Users,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  {
    href: "/hunter",
    label: "Hunter",
    icon: Radar,
    badge: "AI",
    highlight: true,
  },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/opportunities", label: "Opportunities", icon: BriefcaseBusiness },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/tasks", label: "Tasks", icon: ClipboardCheck },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/workers", label: "Workers", icon: UserRound },
  { href: "/ai", label: "AI Assistant", icon: Bot },
  { href: "/imports", label: "Imports", icon: Upload },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block">
      <div className="border-b border-slate-100 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
          Private OS
        </p>
        <h1 className="mt-2 text-lg font-semibold leading-tight text-slate-950">
          Triangle Services
        </h1>
        <p className="mt-1 text-xs text-slate-500">Business Development OS</p>
      </div>
      <nav className="space-y-1 p-2.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          const highlight = "highlight" in item && item.highlight;
          const badge = "badge" in item ? item.badge : undefined;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition",
                active
                  ? "bg-slate-900 text-white"
                  : highlight
                    ? "bg-gradient-to-r from-sky-50 to-emerald-50 text-sky-900 hover:from-sky-100 hover:to-emerald-100 ring-1 ring-sky-200"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{item.label}</span>
              {badge && (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                    active
                      ? "bg-white/20 text-white"
                      : "bg-emerald-500 text-white",
                  )}
                >
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
