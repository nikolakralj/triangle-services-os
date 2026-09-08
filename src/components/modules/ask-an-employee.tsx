"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { AgentReport } from "@/components/modules/agent-report";

// ---------------------------------------------------------------------------
// Ask, and get the answer here.
//
// "I asked Scout to find HVAC-EPC. I had to click Workforce and scroll down to
// ask. Then he didn't start immediately. So where do I see his results — the
// Decision Inbox? Scroll again and find 'Scout has an idea'? Or the Signal
// Inbox? It's a mess."
//
// It was. Asking lived on one page, the answer on another, ideas on a third
// and the evidence on a fourth, and nothing said which. One box, on the page
// the CEO already opens every day: type it, it runs while you wait, the answer
// appears underneath.
//
// The waiting is deliberate. A job that goes into a queue for a schedule to
// notice is a request, not a delegation, and the difference is what makes this
// feel like an employee rather than a ticket system.
// ---------------------------------------------------------------------------

interface Employee {
  id: string;
  name: string;
  emoji: string;
  roleTitle: string | null;
}

export interface RecentResult {
  id: string;
  title: string;
  status: string;
  resultSummary: string | null;
  authorName: string;
  authorEmoji: string;
  at: string;
}

export function AskAnEmployee({
  employees,
  recent,
}: {
  employees: Employee[];
  recent: RecentResult[];
}) {
  const router = useRouter();
  const [who, setWho] = useState(employees[0]?.id ?? "");
  const [brief, setBrief] = useState("");
  const [stage, setStage] = useState<"idle" | "sending" | "working">("idle");
  const [outcome, setOutcome] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (employees.length === 0) return null;

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const text = brief.trim();
    if (text.length < 8 || stage !== "idle") return;
    setError(null);
    setOutcome(null);
    setStage("sending");
    try {
      const created = await fetch("/api/agents/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentInstanceId: who,
          // The first line is the title; the whole thing is the brief.
          title: text.split("\n")[0].slice(0, 120),
          objective: text,
          priority: "high",
          constraints: { execution_mode: "in_app" },
        }),
      });
      const createdBody = (await created.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!created.ok) {
        setError(createdBody.error ?? "Could not hand that out.");
        return;
      }

      // Run it now rather than leaving it for a schedule that fires once a day.
      setStage("working");
      const ran = await fetch("/api/agents/run-now", { method: "POST" });
      const ranBody = (await ran.json().catch(() => ({}))) as {
        status?: string;
        message?: string;
        error?: string;
      };
      if (!ran.ok) {
        setOutcome(
          `Handed out, but it could not be run now: ${ranBody.error ?? "unknown reason"}. It stays queued.`,
        );
      } else {
        setOutcome(ranBody.message ?? "Done.");
      }
      setBrief("");
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setStage("idle");
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
      <form onSubmit={ask} className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={who}
            onChange={(e) => setWho(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800"
          >
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.emoji} {e.name}
                {e.roleTitle ? ` — ${e.roleTitle}` : ""}
              </option>
            ))}
          </select>
          <input
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="Find HVAC and EPC contractors looking for subcontractors — no noise, real deals"
            className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={stage !== "idle" || brief.trim().length < 8}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40"
          >
            {stage === "idle" ? (
              <Send className="h-4 w-4" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            {stage === "working" ? "Working…" : stage === "sending" ? "Handing out…" : "Ask"}
          </button>
        </div>
        {stage === "working" && (
          <p className="text-xs text-slate-500">
            Running it now — this takes about a minute. The answer appears below.
          </p>
        )}
        {outcome && <p className="text-sm text-slate-800">{outcome}</p>}
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </form>

      {/* What came back. It was on the Workforce page, below everything else. */}
      {recent.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              What came back
            </p>
            <Link
              href="/agents"
              className="text-xs font-medium text-sky-700 hover:text-sky-900"
            >
              All of it
            </Link>
          </div>
          <div className="mt-2 space-y-2">
            {recent.map((r) => (
              <div key={r.id}>
                <p className="text-xs text-slate-500">
                  {r.authorEmoji} {r.authorName} · {r.title}
                </p>
                {r.resultSummary && (
                  <AgentReport
                    text={r.resultSummary}
                    authorName={r.authorName}
                    authorEmoji={r.authorEmoji}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
