"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Send,
  UserRound,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AssignmentThread } from "@/components/modules/assignment-thread";
import { HireEmployee } from "@/components/modules/hire-employee";
import { AgentReport } from "@/components/modules/agent-report";
import type { AgentTask, AgentRun } from "@/lib/data/agents";
import type {
  WorkforceEmployee,
  HumanMember,
  Assignment,
  WorkerLite,
} from "@/lib/data/workforce";

export interface ProjectLite {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// The Workforce page — the company, not a console.
//
// Board (humans) on top, AI employees as people with roles and departments,
// durable assignments with attached workers as context, quick notes for
// small nudges, and a work log in sentences. Provider (Grok today) is a
// detail on the card, because the employee outlives the brain.
// ---------------------------------------------------------------------------

const ASSIGNMENT_BADGE: Record<
  Assignment["status"],
  { cls: string; label: string }
> = {
  queued: { cls: "bg-slate-100 text-slate-600", label: "Queued" },
  active: { cls: "bg-sky-50 text-sky-700", label: "Working on it" },
  waiting_review: { cls: "bg-amber-50 text-amber-800", label: "Needs review" },
  completed: { cls: "bg-emerald-50 text-emerald-700", label: "Completed" },
  failed: { cls: "bg-rose-50 text-rose-700", label: "Failed" },
  cancelled: { cls: "bg-slate-100 text-slate-500", label: "Taken back" },
};

const PRIORITY_LABEL: Record<Assignment["priority"], string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

const TASK_BADGE: Record<
  AgentTask["status"],
  { icon: typeof Clock; cls: string; label: string }
> = {
  pending: { icon: Clock, cls: "bg-amber-50 text-amber-800", label: "Assigned" },
  done: { icon: CheckCircle2, cls: "bg-emerald-50 text-emerald-700", label: "Completed" },
  cancelled: { icon: XCircle, cls: "bg-slate-100 text-slate-500", label: "Cancelled" },
};

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

function describeRun(run: AgentRun, who: string): string {
  const n = (k: string) => Number(run.summary[k] ?? 0);
  if (run.source === "ingest") {
    const bits: string[] = [];
    if (n("opportunities") > 0)
      bits.push(
        `${n("opportunities")} new ${n("opportunities") === 1 ? "opportunity" : "opportunities"}`,
      );
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
  humans,
  employees,
  assignments,
  workers,
  projects,
  tasks,
  runs,
}: {
  humans: HumanMember[];
  employees: WorkforceEmployee[];
  assignments: Assignment[];
  workers: WorkerLite[];
  projects: ProjectLite[];
  tasks: AgentTask[];
  runs: AgentRun[];
}) {
  const router = useRouter();

  // Assignment form state
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [priority, setPriority] = useState<Assignment["priority"]>("normal");
  const [dueAt, setDueAt] = useState("");
  const [projectId, setProjectId] = useState("");
  const [selectedWorkers, setSelectedWorkers] = useState<Set<string>>(new Set());
  const [showWorkers, setShowWorkers] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Quick note state (legacy tasks — Bob compatibility)
  const [noteAgent, setNoteAgent] = useState("");
  const [note, setNote] = useState("");
  const [sendingNote, setSendingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const byInstance = new Map(employees.map((e) => [e.id, e]));
  const byBadge = new Map(
    employees.filter((e) => e.badgeName).map((e) => [e.badgeName as string, e]),
  );
  const face = (id: string) => byInstance.get(id)?.emoji ?? "🤖";
  const called = (id: string) => byInstance.get(id)?.displayName ?? "someone";
  const badgeFace = (name: string) => byBadge.get(name)?.emoji ?? "🤖";
  const badgeCalled = (name: string) => byBadge.get(name)?.displayName ?? name;

  function toggleWorker(id: string) {
    setSelectedWorkers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function createNewAssignment() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/agents/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentInstanceId: employeeId,
          title,
          objective,
          priority,
          dueAt: dueAt || undefined,
          projectId: projectId || undefined,
          workerIds: Array.from(selectedWorkers),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not create the assignment.");
        return;
      }
      setTitle("");
      setObjective("");
      setDueAt("");
      setProjectId("");
      setSelectedWorkers(new Set());
      setShowWorkers(false);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  async function takeBack(assignmentId: string) {
    setCancellingId(assignmentId);
    try {
      const res = await fetch("/api/agents/assignments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId }),
      });
      if (res.ok) router.refresh();
    } finally {
      setCancellingId(null);
    }
  }

  async function sendNote() {
    setSendingNote(true);
    setNoteError(null);
    try {
      const res = await fetch("/api/agents/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentName: noteAgent, instruction: note }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setNoteError(data.error ?? "Could not send the note.");
        return;
      }
      setNote("");
      router.refresh();
    } catch {
      setNoteError("Network error. Please try again.");
    } finally {
      setSendingNote(false);
    }
  }

  const badgeNames = employees
    .filter((e) => e.badgeName)
    .map((e) => ({ name: e.badgeName as string, label: `${e.emoji} ${e.displayName}` }));

  return (
    <div className="space-y-6">
      {/* Board */}
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Board
        </p>
        <div className="flex flex-wrap gap-3">
          {humans.map((h) => (
            <div
              key={h.userId}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white">
                <UserRound className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">{h.email}</p>
                <p className="text-xs capitalize text-slate-500">{h.role} · human</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AI employees */}
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          AI employees
        </p>
        <div className="mb-3">
          <HireEmployee />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {employees.length === 0 ? (
            <p className="col-span-full rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
              Nobody hired yet. Hire one above — it takes about a minute.
            </p>
          ) : (
            employees.map((e) => (
              <div
                key={e.id}
                className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100 text-2xl">
                  {e.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{e.displayName}</p>
                    <span
                      className={
                        e.onDuty
                          ? "inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                          : e.neverStarted
                            ? "inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800"
                            : "inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500"
                      }
                    >
                      <span
                        className={
                          e.onDuty
                            ? "h-1.5 w-1.5 rounded-full bg-emerald-500"
                            : e.neverStarted
                              ? "h-1.5 w-1.5 rounded-full bg-amber-500"
                              : "h-1.5 w-1.5 rounded-full bg-slate-400"
                        }
                      />
                      {e.onDuty ? "On duty" : e.neverStarted ? "Not started" : "Off duty"}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-sky-700">
                    {e.department ? `${e.department} · ` : ""}
                    {e.roleKey.replace(/_/g, " ")}
                  </p>
                  {e.description && (
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      {e.description}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-slate-400">
                    {e.provider ? `works on ${e.provider}` : "no workstation yet"}
                    {" · "}
                    {e.openAssignments === 0
                      ? "nothing waiting"
                      : `${e.openAssignments} waiting`}
                    {e.lastUsedAt ? ` · seen ${friendlyTime(e.lastUsedAt)}` : ""}
                  </p>
                  {e.neverStarted && e.openAssignments > 0 && (
                    <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-[11px] leading-relaxed text-amber-800">
                      {e.displayName} has work waiting but has never contacted
                      Triangle. Paste the instructions and token into the bot,
                      then ask it to run once.
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* New assignment */}
      {employees.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-900">New assignment</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-[auto_1fr_auto_auto]">
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400"
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.emoji} {e.displayName}
                </option>
              ))}
            </select>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title — e.g. Find work for our available PCS7 engineers"
              className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Assignment["priority"])}
              className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400"
            >
              {(["low", "normal", "high", "urgent"] as const).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
          </div>
          {projects.length > 0 && (
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="mt-2 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400"
            >
              <option value="">No particular project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <textarea
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            rows={3}
            placeholder="Objective, the way you'd brief a colleague — what to find, where, constraints, what a good result looks like."
            className="mt-2 w-full resize-y rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
          />

          {/* Worker context */}
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowWorkers((v) => !v)}
              className="text-xs font-medium text-sky-700 hover:text-sky-900"
            >
              {showWorkers
                ? "Hide workers"
                : selectedWorkers.size > 0
                  ? `Attached workers (${selectedWorkers.size}) — edit`
                  : "+ Attach workers as context (for “find work for these people”)"}
            </button>
            {showWorkers && (
              <div className="mt-2 grid max-h-44 gap-1 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-2 sm:grid-cols-2 lg:grid-cols-3">
                {workers.length === 0 ? (
                  <p className="col-span-full text-xs text-slate-500">
                    No active workers in the talent pool.
                  </p>
                ) : (
                  workers.map((w) => (
                    <label
                      key={w.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-slate-700 hover:bg-white"
                    >
                      <input
                        type="checkbox"
                        checked={selectedWorkers.has(w.id)}
                        onChange={() => toggleWorker(w.id)}
                        className="h-3.5 w-3.5"
                      />
                      <span className="truncate">
                        {w.name}
                        {w.role ? ` · ${w.role}` : ""}
                        {w.availability === "available" ? " · ✅ free" : ""}
                      </span>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Button
              variant="primary"
              className="h-9 px-3 text-xs"
              disabled={creating || !title.trim() || !objective.trim() || !employeeId}
              onClick={() => void createNewAssignment()}
            >
              {creating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Assign to {called(employeeId)}
            </Button>
            {error && (
              <span className="flex items-center gap-1 text-xs text-rose-600">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Assignments */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">
          Assignments
        </p>
        {assignments.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No assignments yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {assignments.map((a) => {
              const badge = ASSIGNMENT_BADGE[a.status];
              return (
                <li key={a.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">{a.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                        {a.objective}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {face(a.agentInstanceId)} {called(a.agentInstanceId)}
                        {a.priority !== "normal" ? ` · ${PRIORITY_LABEL[a.priority]}` : ""}
                        {a.dueAt
                          ? ` · due ${new Date(a.dueAt).toLocaleDateString([], { day: "numeric", month: "short" })}`
                          : ""}
                        {a.projectName ? ` · ${a.projectName}` : ""}
                        {a.workers.length > 0
                          ? ` · with ${a.workers.map((w) => w.name).join(", ")}`
                          : ""}
                        {` · ${friendlyTime(a.createdAt)}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                      {(a.status === "queued" || a.status === "active") && (
                        <Button
                          variant="ghost"
                          className="h-6 px-2 text-xs"
                          disabled={cancellingId === a.id}
                          onClick={() => void takeBack(a.id)}
                        >
                          {cancellingId === a.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Take it back"
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                  {a.resultSummary && (
                    <AgentReport
                      text={a.resultSummary}
                      authorName={called(a.agentInstanceId)}
                      authorEmoji={face(a.agentInstanceId)}
                    />
                  )}
                  {a.status !== "cancelled" && (
                    <AssignmentThread
                      assignmentId={a.id}
                      messageCount={a.messageCount}
                      awaitingAgent={a.awaitingAgent}
                      agentName={called(a.agentInstanceId)}
                      finished={a.status === "completed" || a.status === "failed"}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Quick notes (legacy tasks — Bob picks these up too) */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">
          Quick notes
        </p>
        <div className="space-y-3 p-4">
          {badgeNames.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <select
                value={noteAgent || badgeNames[0]?.name || ""}
                onChange={(e) => setNoteAgent(e.target.value)}
                className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400"
              >
                {badgeNames.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.label}
                  </option>
                ))}
              </select>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="A one-liner — “re-check this morning’s mail, two messages look missing.”"
                className="h-8 min-w-64 flex-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
              <Button
                variant="secondary"
                className="h-8 px-3 text-xs"
                disabled={sendingNote || !note.trim()}
                onClick={() => {
                  if (!noteAgent && badgeNames[0]) setNoteAgent(badgeNames[0].name);
                  void sendNote();
                }}
              >
                {sendingNote ? <Loader2 className="h-3 w-3 animate-spin" /> : "Send"}
              </Button>
            </div>
          )}
          {noteError && (
            <p className="flex items-center gap-1 text-xs text-rose-600">
              <AlertCircle className="h-3 w-3 shrink-0" />
              {noteError}
            </p>
          )}
          {tasks.length === 0 ? (
            <p className="text-xs text-slate-400">No notes yet.</p>
          ) : (
            <ul className="space-y-2">
              {tasks.slice(0, 8).map((t) => {
                const b = TASK_BADGE[t.status];
                const Icon = b.icon;
                return (
                  <li key={t.id} className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-700">{t.instruction}</p>
                      <p className="text-[11px] text-slate-400">
                        for {badgeFace(t.agentName)} {badgeCalled(t.agentName)} ·{" "}
                        {friendlyTime(t.createdAt)}
                      </p>
                      {t.result && (
                        <AgentReport
                          text={t.result}
                          authorName={badgeCalled(t.agentName)}
                          authorEmoji={badgeFace(t.agentName)}
                        />
                      )}
                      {!t.result && t.status === "pending" && (
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {t.deliveredAt
                            ? `Picked up ${friendlyTime(t.deliveredAt)} — no answer yet`
                            : "Not picked up yet"}
                        </p>
                      )}
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${b.cls}`}
                    >
                      <Icon className="h-3 w-3" />
                      {b.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
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
              <li
                key={i}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
              >
                <p className="flex min-w-0 items-center gap-2 text-sm text-slate-700">
                  <span className="text-base leading-none">{badgeFace(r.agentName)}</span>
                  {describeRun(r, badgeCalled(r.agentName))}
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
