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
  Settings,
  Upload,
  Users,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
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
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition",
                active
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
