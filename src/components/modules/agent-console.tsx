"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Clock,
  Loader2,
  Send,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AgentInfo, AgentTask, AgentRun } from "@/lib/data/agents";

// ---------------------------------------------------------------------------
// The Agent Console: steer external agents from the dashboard.
//
// Honest model, stated in the UI too: this is a message queue, not live chat.
// An instruction written here is picked up the next time the agent runs —
// or immediately, if you poke the agent once in its own app. Results and
// activity land back here, so Ralph never needs the bot platform at all.
// ---------------------------------------------------------------------------

const STATUS_STYLE: Record<AgentTask["status"], { icon: typeof Clock; cls: string; label: string }> = {
  pending: { icon: Clock, cls: "bg-amber-50 text-amber-800", label: "Waiting for agent" },
  done: { icon: CheckCircle2, cls: "bg-emerald-50 text-emerald-700", label: "Done" },
  cancelled: { icon: XCircle, cls: "bg-slate-100 text-slate-500", label: "Cancelled" },
};

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
        setError(data.error ?? "Could not save the instruction.");
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
      {/* Roster */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {agents.length === 0 ? (
          <p className="col-span-full rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
            No agents yet. Create one with{" "}
            <code className="rounded bg-slate-200 px-1 text-xs">
              node scripts/create-machine-credential.mjs
            </code>
          </p>
        ) : (
          agents.map((a) => (
            <div key={a.name} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <Bot className="h-4 w-4 shrink-0 text-slate-400" />
                {a.name}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                can: {a.scopes.join(", ") || "—"}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {a.lastUsedAt
                  ? `last active ${new Date(a.lastUsedAt).toLocaleString()}`
                  : "never active yet"}
              </p>
            </div>
          ))
        )}
      </div>

      {/* Composer */}
      {agents.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-900">Send an instruction</p>
          <p className="mt-1 text-xs text-slate-500">
            The agent picks it up at the start of its next run and reports back
            here. This is a queue, not live chat — for an immediate run, poke the
            agent once in its own app.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <select
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400"
            >
              {agents.map((a) => (
                <option key={a.name} value={a.name}>
                  {a.name}
                </option>
              ))}
            </select>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={2}
              placeholder='e.g. "Re-send the two messages from Diogo Barreto from 24 Aug — they look missing."'
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
              Queue it
            </Button>
          </div>
          {error && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-rose-600">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}
        </div>
      )}

      {/* Instructions */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">
          Instructions
        </p>
        {tasks.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">Nothing queued yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {tasks.map((t) => {
              const st = STATUS_STYLE[t.status];
              const Icon = st.icon;
              return (
                <li key={t.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-800">{t.instruction}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      → {t.agentName} · {new Date(t.createdAt).toLocaleString()}
                    </p>
                    {t.result && (
                      <p className="mt-1.5 rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">
                        {t.result}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}
                    >
                      <Icon className="h-3 w-3" />
                      {st.label}
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
                          "Cancel"
                        )}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Activity */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">
          Recent activity
        </p>
        {runs.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">
            No runs recorded yet — activity appears here from the next sync or
            bot post onward.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {runs.map((r, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <p className="text-sm text-slate-800">
                  <span className="font-medium">{r.agentName}</span>
                  <span className="text-slate-400"> · {r.source}</span>
                </p>
                <p className="text-xs text-slate-500">
                  {Object.entries(r.summary)
                    .filter(([, v]) => typeof v !== "object")
                    .map(([k, v]) => `${k} ${String(v)}`)
                    .join(" · ")}
                </p>
                <p className="text-xs text-slate-400">
                  {new Date(r.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
