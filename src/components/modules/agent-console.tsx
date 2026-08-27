"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Send,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AgentInfo, AgentTask, AgentRun } from "@/lib/data/agents";

// ---------------------------------------------------------------------------
// The team page. Nikola's framing: agents are employees, he is the manager.
// So the UI speaks that language — names and roles, "on duty", assignments,
// a work log — and keeps credential plumbing out of sight.
//
// Still honest underneath: an assignment is picked up on the agent's next
// run, not pushed. The copy says so without turning technical.
// ---------------------------------------------------------------------------

const TASK_BADGE: Record<
  AgentTask["status"],
  { icon: typeof Clock; cls: string; label: string }
> = {
  pending: { icon: Clock, cls: "bg-amber-50 text-amber-800", label: "Assigned" },
  done: { icon: CheckCircle2, cls: "bg-emerald-50 text-emerald-700", label: "Completed" },
  cancelled: { icon: XCircle, cls: "bg-slate-100 text-slate-500", label: "Cancelled" },
};

/** "8/27/2026, 10:02" is an audit stamp; people say "today 10:02". */
function friendlyTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `today ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `yesterday ${time}`;
  return `${d.toLocaleDateString([], { day: "numeric", month: "short" })}, ${time}`;
}

/** Turn a run summary into a human sentence instead of key:value pairs. */
function describeRun(run: AgentRun, who: string): string {
  const n = (k: string) => Number(run.summary[k] ?? 0);
  if (run.source === "ingest") {
    const bits: string[] = [];
    if (n("opportunities") > 0) bits.push(`${n("opportunities")} new ${n("opportunities") === 1 ? "opportunity" : "opportunities"}`);
    if (n("alreadySeen") > 0) bits.push(`${n("alreadySeen")} already known`);
    if (n("noiseDiscarded") > 0) bits.push(`${n("noiseDiscarded")} noise skipped`);
    if (n("errors") > 0) bits.push(`${n("errors")} errors`);
    return `${who} handed in ${n("received")} emails — ${bits.join(", ") || "nothing new"}.`;
  }
  if (run.source === "imap") {
    const bits: string[] = [];
    if (n("leadsCreated") > 0) bits.push(`${n("leadsCreated")} new leads`);
    if (n("alreadySeen") > 0) bits.push(`${n("alreadySeen")} already known`);
    if (n("errors") > 0) bits.push(`${n("errors")} errors`);
    return `Mailbox check read ${n("fetched")} emails — ${bits.join(", ") || "nothing new"}.`;
  }
  return `${who}: ${Object.entries(run.summary)
    .filter(([, v]) => typeof v !== "object")
    .map(([k, v]) => `${k} ${String(v)}`)
    .join(", ")}`;
}

export function AgentConsole({
  agents,
  tasks,
  runs,
}: {
  agents: AgentInfo[];
  tasks: AgentTask[];
  runs: AgentRun[];
}) {
  const router = useRouter();
  const [agentName, setAgentName] = useState(agents[0]?.name ?? "");
  const [instruction, setInstruction] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const byName = new Map(agents.map((a) => [a.name, a]));
  const face = (name: string) => byName.get(name)?.emoji ?? "🤖";
  const called = (name: string) => byName.get(name)?.displayName ?? name;

  async function send() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/agents/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentName, instruction }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not hand over the task.");
        return;
      }
      setInstruction("");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSending(false);
    }
  }

  async function cancel(taskId: string) {
    setCancellingId(taskId);
    try {
      const res = await fetch("/api/agents/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      });
      if (res.ok) router.refresh();
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* The team */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {agents.length === 0 ? (
          <p className="col-span-full rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
            No one on the team yet.
          </p>
        ) : (
          agents.map((a) => (
            <div
              key={a.name}
              className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100 text-2xl">
                {a.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{a.displayName}</p>
                  <span
                    className={
                      a.onDuty
                        ? "inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                        : "inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500"
                    }
                  >
                    <span
                      className={
                        a.onDuty
                          ? "h-1.5 w-1.5 rounded-full bg-emerald-500"
                          : "h-1.5 w-1.5 rounded-full bg-slate-400"
                      }
                    />
                    {a.onDuty ? "On duty" : "Off duty"}
                  </span>
                </div>
                <p className="text-xs font-medium text-sky-700">{a.roleTitle}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  {a.description ?? `Allowed to ${a.duty}.`}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {a.lastUsedAt ? `last seen ${friendlyTime(a.lastUsedAt)}` : "hasn’t started yet"}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Hand over a task */}
      {agents.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-900">Give someone a task</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <select
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400"
            >
              {agents.map((a) => (
                <option key={a.name} value={a.name}>
                  {a.emoji} {a.displayName}
                </option>
              ))}
            </select>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={2}
              placeholder="Write it the way you would to a colleague — e.g. “Check this morning’s mail again, I think two messages are missing.”"
              className="min-w-64 flex-1 resize-y rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
            <Button
              variant="primary"
              className="h-9 px-3 text-xs"
              disabled={sending || !instruction.trim() || !agentName}
              onClick={() => void send()}
            >
              {sending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Hand it over
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {called(agentName)} will pick it up on the next shift and report back here.
          </p>
          {error && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-rose-600">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}
        </div>
      )}

      {/* Assignments */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">
          Assignments
        </p>
        {tasks.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">Nothing assigned right now.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {tasks.map((t) => {
              const badge = TASK_BADGE[t.status];
              const Icon = badge.icon;
              return (
                <li key={t.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-800">{t.instruction}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        for {face(t.agentName)} {called(t.agentName)} · {friendlyTime(t.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}
                      >
                        <Icon className="h-3 w-3" />
                        {badge.label}
                      </span>
                      {t.status === "pending" && (
                        <Button
                          variant="ghost"
                          className="h-6 px-2 text-xs"
                          disabled={cancellingId === t.id}
                          onClick={() => void cancel(t.id)}
                        >
                          {cancellingId === t.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Take it back"
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                  {t.result && (
                    <div className="mt-2 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2">
                      <span className="text-base leading-none">{face(t.agentName)}</span>
                      <p className="text-xs leading-relaxed text-slate-600">
                        <span className="font-medium text-slate-700">
                          {called(t.agentName)}:
                        </span>{" "}
                        {t.result}
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Work log */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">
          Work log
        </p>
        {runs.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">
            Quiet so far today — finished work shows up here on its own.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {runs.map((r, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <p className="flex min-w-0 items-center gap-2 text-sm text-slate-700">
                  <span className="text-base leading-none">{face(r.agentName)}</span>
                  {describeRun(r, called(r.agentName))}
                </p>
                <p className="shrink-0 text-xs text-slate-400">{friendlyTime(r.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
