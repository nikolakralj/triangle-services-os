"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Check, ExternalLink, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ApprovalItem } from "@/lib/data/approvals";

// ---------------------------------------------------------------------------
// The one queue. Everything an employee proposes shows up here, whichever
// table it lives in, so no work can hide inside a collapsed panel on a page
// you didn't think to open.
// ---------------------------------------------------------------------------

const TYPE_LABEL: Record<string, string> = {
  chain_node: "Company in the chain",
  buyer_contact: "Buyer contact",
  package_opportunity: "Package opportunity",
  note: "Research note",
  project: "New project",
  company: "New company",
  contact: "New contact",
  other: "Other",
};

function confidenceTone(c: number): string {
  if (c >= 85) return "bg-emerald-50 text-emerald-700";
  if (c >= 60) return "bg-amber-50 text-amber-800";
  return "bg-slate-100 text-slate-600";
}

export function ApprovalsQueue({
  items,
  readOnly = false,
}: {
  items: ApprovalItem[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decided, setDecided] = useState<Set<string>>(new Set());

  async function decide(item: ApprovalItem, action: "accept" | "reject") {
    setBusyId(item.id);
    setError(null);
    try {
      const res = await fetch("/api/approvals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, kind: item.kind, action }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not save that decision.");
        return;
      }
      // Drop it from the list straight away; the refresh confirms.
      setDecided((prev) => new Set(prev).add(item.id));
      router.refresh();
    } catch {
      setError("Network error — the decision was not saved. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  const visible = items.filter((i) => !decided.has(i.id));

  if (visible.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
        <p className="text-sm font-medium text-slate-700">
          {readOnly ? "Nothing here yet" : "Nothing waiting on you"}
        </p>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          {readOnly
            ? "Decisions you make show up here so you can look back at them."
            : "Everything your employees have proposed has been decided. New work appears here as soon as they find it."}
        </p>
      </div>
    );
  }

  // Group by project so a pile on one project gets judged together.
  const groups = new Map<string, ApprovalItem[]>();
  for (const item of visible) {
    const key = item.projectName ?? "New discoveries";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="flex items-center gap-1.5 text-sm text-rose-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {Array.from(groups.entries()).map(([groupName, groupItems]) => {
        const projectId = groupItems.find((i) => i.projectId)?.projectId ?? null;
        return (
          <section key={groupName}>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">
                {projectId ? (
                  <Link href={`/hunter/${projectId}`} className="hover:underline">
                    {groupName}
                  </Link>
                ) : (
                  groupName
                )}
              </h2>
              <span className="text-xs text-slate-500">
                {groupItems.length} {readOnly ? "item" : "to decide"}
                {readOnly && groupItems.length !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {groupItems.map((item) => (
                <div key={item.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                          {TYPE_LABEL[item.itemType] ?? item.itemType}
                        </span>
                        {item.confidence !== null && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${confidenceTone(item.confidence)}`}
                          >
                            {item.confidence}% sure
                          </span>
                        )}
                        {item.agentName && (
                          <span className="text-[11px] text-slate-400">
                            {item.agentEmoji ? `${item.agentEmoji} ` : ""}
                            {item.agentName}
                          </span>
                        )}
                      </div>

                      <p className="mt-1.5 text-sm font-medium text-slate-950">
                        {item.headline}
                      </p>
                      {item.detail && (
                        <p className="mt-0.5 text-xs text-slate-600">{item.detail}</p>
                      )}

                      {item.evidenceText && (
                        <p className="mt-2 border-l-2 border-slate-200 pl-2 text-xs leading-relaxed text-slate-500">
                          &ldquo;{item.evidenceText.slice(0, 260)}
                          {item.evidenceText.length > 260 ? "…" : ""}&rdquo;
                        </p>
                      )}

                      {item.sourceUrl && (
                        <a
                          href={item.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-900"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Source
                        </a>
                      )}
                    </div>

                    {!readOnly && (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Button
                          variant="primary"
                          className="h-8 px-3 text-xs"
                          disabled={busyId !== null}
                          onClick={() => void decide(item, "accept")}
                        >
                          {busyId === item.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                          Accept
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-8 px-2.5 text-xs"
                          disabled={busyId !== null}
                          title="Reject"
                          onClick={() => void decide(item, "reject")}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
