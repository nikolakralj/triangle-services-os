"use client";

import Link from "next/link";
import {
  Building2,
  ChevronDown,
  FileUp,
  Plus,
  Search,
  UserPlus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { ORGANIZATION_NAME } from "@/lib/constants";

export function Topbar() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex min-h-16 flex-col gap-3 px-4 py-3 xl:flex-row xl:items-center xl:justify-between xl:px-6">
        <div className="flex items-center gap-3">
          <div className="relative w-full max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Search companies, contacts, opportunities, workers, documents..."
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
            {ORGANIZATION_NAME}
          </span>
          <span className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
            Nikola / admin
          </span>
          <div className="group relative">
            <Button variant="primary">
              <Plus className="h-4 w-4" />
              Quick add
              <ChevronDown className="h-4 w-4" />
            </Button>
            <div className="invisible absolute right-0 top-10 w-56 rounded-lg border border-slate-200 bg-white p-2 opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100">
              {[
                { href: "/companies", label: "Add company", icon: Building2 },
                { href: "/contacts", label: "Add contact", icon: UserPlus },
                { href: "/opportunities", label: "Add opportunity", icon: Plus },
                { href: "/tasks", label: "Add task", icon: Plus },
                { href: "/documents", label: "Upload document", icon: FileUp },
                { href: "/workers", label: "Add worker", icon: Users },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
