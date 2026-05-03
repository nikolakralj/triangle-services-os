"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export function PersistedCollapsible({
  storageKey,
  title,
  description,
  defaultOpen = false,
  children,
}: {
  storageKey: string;
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return defaultOpen;
    const saved = sessionStorage.getItem(storageKey);
    if (!saved) return defaultOpen;
    return saved === "1";
  });

  useEffect(() => {
    sessionStorage.setItem(storageKey, open ? "1" : "0");
  }, [open, storageKey]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
      >
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
      </button>
      {open ? <div className="border-t border-slate-100 p-4">{children}</div> : null}
    </div>
  );
}
