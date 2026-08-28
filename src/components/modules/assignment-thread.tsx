"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquare, Send } from "lucide-react";
import type { AssignmentMessage } from "@/lib/data/assignment-threads";

// ---------------------------------------------------------------------------
// The conversation on one assignment.
//
// Collapsed by default and fetched on open — a workforce page with twenty jobs
// should not pull twenty threads nobody is reading.
//
// The honesty that matters here is delivery. Bot platforms poll; we cannot
// push. So a follow-up sits as "not picked up yet" until the agent's next
// inbox check, and the UI says exactly that instead of implying the message
// has been read.
// ---------------------------------------------------------------------------

export function AssignmentThread({
  assignmentId,
  messageCount,
  awaitingAgent,
  agentName,
  finished,
}: {
  assignmentId: string;
  messageCount: number;
  awaitingAgent: number;
  agentName: string;
  finished: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AssignmentMessage[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/assignments/${assignmentId}/messages`);
      const data = (await res.json().catch(() => ({}))) as {
        messages?: AssignmentMessage[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not load the conversation.");
        return;
      }
      setMessages(data.messages ?? []);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && messages === null) void load();
  }

  async function send() {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/assignments/${assignmentId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: body }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        messages?: AssignmentMessage[];
        reopened?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not send that.");
        return;
      }
      setDraft("");
      setMessages(data.messages ?? []);
      setNotice(
        data.reopened
          ? `Reopened — ${agentName} will pick this up on the next check.`
          : `${agentName} will pick this up on the next check.`,
      );
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={toggle}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"
      >
        <MessageSquare className="h-3.5 w-3.5" />
        {messageCount === 0
          ? "Ask a follow-up"
          : `Conversation · ${messageCount}`}
        {awaitingAgent > 0 && (
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
            {awaitingAgent} not picked up yet
          </span>
        )}
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          {loading && (
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading…
            </p>
          )}

          {messages && messages.length > 0 && (
            <ul className="mb-3 space-y-2">
              {messages.map((m) => (
                <li
                  key={m.id}
                  className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${
                    m.role === "human"
                      ? "bg-white text-slate-700 ring-1 ring-slate-200"
                      : "bg-sky-50 text-slate-800"
                  }`}
                >
                  <p className="mb-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                    <span className="font-medium text-slate-600">
                      {m.authorName ?? (m.role === "human" ? "You" : agentName)}
                    </span>
                    <span>
                      {new Date(m.createdAt).toLocaleString([], {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {m.role === "human" && !m.deliveredAt && (
                      <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-800">
                        not picked up yet
                      </span>
                    )}
                  </p>
                  <p className="whitespace-pre-wrap">{m.body}</p>
                </li>
              ))}
            </ul>
          )}

          {messages && messages.length === 0 && !loading && (
            <p className="mb-3 text-xs text-slate-500">
              Nothing said yet. Ask {agentName} anything about this job — it
              lands in their inbox with the whole history attached.
            </p>
          )}

          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              placeholder={
                finished
                  ? `Follow-up — this reopens the job for ${agentName}`
                  : `Ask ${agentName} something about this job`
              }
              className="min-h-[52px] flex-1 resize-y rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
              }}
            />
            <button
              type="button"
              disabled={sending || !draft.trim()}
              onClick={() => void send()}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-900 bg-slate-900 px-3 text-xs font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Send
            </button>
          </div>

          {notice && <p className="mt-1.5 text-xs text-slate-500">{notice}</p>}
          {error && <p className="mt-1.5 text-xs text-rose-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
