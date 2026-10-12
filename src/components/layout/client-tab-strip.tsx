"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Pinned client tabs, drawn like browser tabs under the top bar.
//
// Not a nav section: the shell stays Today / Missions / Talent / Team (+
// Settings). The strip only renders when the owner has pinned a client, holds
// at most five, and each tab leaves when the deal is won, lost or gone quiet.
// ---------------------------------------------------------------------------

export interface StripTab {
  id: string;
  key: string;
  name: string;
  quiet: boolean;
}

export function ClientTabStrip({ tabs }: { tabs: StripTab[] }) {
  const pathname = usePathname();
  if (tabs.length === 0) return null;
  return (
    <nav
      aria-label="Pinned clients"
      className="flex min-w-0 gap-1 overflow-x-auto border-b border-slate-200 bg-white px-4 pt-1 xl:px-5"
    >
      {tabs.map((tab) => {
        const href = `/client-tabs/${encodeURIComponent(tab.key)}`;
        const active = pathname === href;
        return (
          <Link
            key={tab.id}
            href={href}
            title={tab.quiet ? `${tab.name}: nothing new for 30 days` : tab.name}
            className={cn(
              "max-w-[14rem] truncate rounded-t-md border border-b-0 px-3 py-1.5 text-xs font-medium",
              active
                ? "border-slate-300 bg-slate-50 text-sky-800"
                : "border-transparent text-slate-600 hover:bg-slate-100",
              tab.quiet && !active ? "text-slate-400" : "",
            )}
          >
            {tab.name}
            {tab.quiet ? " · quiet" : ""}
          </Link>
        );
      })}
    </nav>
  );
}
