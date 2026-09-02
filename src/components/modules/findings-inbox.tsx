"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Check, ExternalLink, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AgentFinding } from "@/lib/data/findings";

// ---------------------------------------------------------------------------
// The approvals inbox for agent findings.
//
// One queue, evidence visible before the decision. Accepting a project
// finding creates the real record — the moment a discovery enters the
// business — so the source and the quote are shown up front rather than
// hidden behind a click.
// ---------------------------------------------------------------------------

function confidenceTone(c: number | null): string {
  if (c === null) return "bg-slate-100 text-slate-600";
  if (c >= 85) return "bg-emerald-50 text-emerald-700";
  if (c >= 60) return "bg-amber-50 text-amber-800";
  return "bg-slate-100 text-slate-600";
}

function title(f: AgentFinding): string {
  const p = f.payload;
  return String(
    p.project_name ?? p.name ?? p.company ?? p.title ?? f.findingType,
  );
}

export function FindingsInbox({ findings }: { findings: AgentFinding[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [destinationHref, setDestinationHref] = useState<string | null>(null);

  async function decide(findingId: string, action: "accept" | "reject") {
    setBusyId(findingId);
    setError(null);
    setDone(null);
    setDestinationHref(null);
    try {
      const res = await fetch("/api/findings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ findingId, action }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        promotedTo?: string | null;
        continuationAssignmentId?: string | null;
        destinationHref?: string | null;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not save that decision.");
        return;
      }
      if (action === "accept" && data.promotedTo === "discovered_project") {
        setDone("Accepted — it is now a project, and agents can research it.");
      } else if (action === "accept" && data.promotedTo === "company") {
        setDone(
          data.continuationAssignmentId
            ? "Accepted — the research employee is continuing this company case automatically."
            : "Accepted — it is now a company case waiting for an employee.",
        );
      }
      setDestinationHref(data.destinationHref ?? null);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (findings.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
        <p className="text-sm font-medium text-slate-700">Nothing waiting</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          When an employee discovers something Triangle has never heard of — a
          project, a company, a contact — it lands here for your decision
          before it becomes a real record.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="flex items-center gap-1.5 text-sm text-rose-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
      {done && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <span className="flex items-center gap-1.5">
            <Check className="h-4 w-4 shrink-0" />
            {done}
          </span>
          {destinationHref && (
            <Link href={destinationHref} className="font-semibold hover:underline">
              Open the living case →
            </Link>
          )}
        </div>
      )}

      {findings.map((f) => (
        <article key={f.id} className="rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                  {f.findingType}
                </span>
                {f.confidence !== null && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${confidenceTone(f.confidence)}`}
                  >
                    {f.confidence}% confident
                  </span>
                )}
              </div>
              <h3 className="mt-1.5 text-base font-semibold text-slate-950">
                {title(f)}
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                {f.agentEmoji} {f.agentName ?? "an employee"}
                {f.assignmentTitle ? ` · while working on “${f.assignmentTitle}”` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="primary"
                className="h-8 px-3 text-xs"
                disabled={busyId === f.id}
                onClick={() => void decide(f.id, "accept")}
              >
                {busyId === f.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Accept
              </Button>
              <Button
                variant="ghost"
                className="h-8 px-3 text-xs"
                disabled={busyId === f.id}
                onClick={() => void decide(f.id, "reject")}
              >
                <X className="h-3.5 w-3.5" />
                Reject
              </Button>
            </div>
          </div>

          {/* Evidence — the reason to trust or distrust this */}
          {(f.evidenceText || f.sourceUrl) && (
            <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
              {f.evidenceText && (
                <p className="text-xs leading-relaxed text-slate-600">
                  “{f.evidenceText}”
                </p>
              )}
              {f.sourceUrl && (
                <a
                  href={f.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-900"
                >
                  <ExternalLink className="h-3 w-3" />
                  Check the source
                </a>
              )}
            </div>
          )}

          {/* Extra structured fields worth seeing before deciding */}
          {Object.keys(f.payload).length > 0 && (
            <div className="grid grid-cols-2 gap-px border-t border-slate-100 bg-slate-100 sm:grid-cols-4">
              {Object.entries(f.payload)
                .filter(([, v]) => v !== null && v !== "" && typeof v !== "object")
                .slice(0, 8)
                .map(([k, v]) => (
                  <div key={k} className="bg-white px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      {k.replace(/_/g, " ")}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-800">{String(v)}</p>
                  </div>
                ))}
            </div>
          )}

          {f.promotedEntityId && f.promotedEntityType === "discovered_project" && (
            <div className="border-t border-slate-100 px-4 py-2">
              <Link
                href={`/hunter/${f.promotedEntityId}`}
                className="text-xs font-medium text-sky-700 hover:text-sky-900"
              >
                Open the project →
              </Link>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
