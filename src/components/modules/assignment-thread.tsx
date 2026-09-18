"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquare } from "lucide-react";
import type { AssignmentMessage } from "@/lib/data/assignment-threads";

// ---------------------------------------------------------------------------
// The conversation on one assignment.
//
// Collapsed by default and fetched on open — a workforce page with twenty jobs
// should not pull twenty threads nobody is reading.
//
// The honesty that matters here is delivery. Triangle can webhook-wake a
// bot-runtime employee when you post, but that is a pickup request, not a
// chat send. A follow-up stays "not picked up yet" until the agent fetches
// the thread (or answers in it). If the wake is missing or fails, they pick
// it up on the next scheduled inbox check.
// ---------------------------------------------------------------------------

export function AssignmentThread({
  assignmentId,
  messageCount,
  awaitingAgent,
  agentName,
  recipientLabel,
  finished,
  label,
  alwaysOpen = false,
  composerHint,
}: {
  assignmentId: string;
  messageCount: number;
  awaitingAgent: number;
  agentName: string;
  recipientLabel?: string;
  finished: boolean;
  label?: string;
  /** Skip the fold; used in the Today thread drawer. */
  alwaysOpen?: boolean;
  /**
   * Shown above the composer, given whatever is currently typed. The drawer
   * uses it to notice an ask that belongs to a different colleague.
   */
  composerHint?: (draft: string) => ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(alwaysOpen);
  const [messages, setMessages] = useState<AssignmentMessage[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const recipient = recipientLabel ?? agentName;

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

  useEffect(() => {
    if (!alwaysOpen) return;
    let cancelled = false;
    fetch(`/api/assignments/${assignmentId}/messages`)
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          messages?: AssignmentMessage[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "Could not load the conversation.");
          setMessages([]);
          return;
        }
        setMessages(data.messages ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Network error.");
          setMessages([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [alwaysOpen, assignmentId]);

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
        notice?: string;
        wake?: { status?: string } | null;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not send that.");
        return;
      }
      setDraft("");
      setMessages(data.messages ?? []);
      setNotice(
        data.notice ??
          (data.reopened
            ? "Reopened. Queued. Waiting for pickup."
            : "Queued. Waiting for pickup."),
      );
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={alwaysOpen ? "" : "mt-2"}>
      {!alwaysOpen && (
        <button
          type="button"
          onClick={toggle}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          {label ?? (messageCount === 0
            ? "Ask a follow-up"
            : `Conversation · ${messageCount}`)}
          {awaitingAgent > 0 && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
              {awaitingAgent} not picked up yet
            </span>
          )}
        </button>
      )}

      {open && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          {(loading || (open && messages === null && !error)) && (
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
              Nothing said yet. Ask the {recipient} anything about this case.
              The manager routes it with the whole history attached.
            </p>
          )}

          {composerHint?.(draft)}

          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              placeholder={
                finished
                  ? `Ask the ${recipient} to clarify or continue`
                  : `Give the ${recipient} additional direction`
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
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-slate-900 bg-slate-900 px-3 text-xs font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <MessageSquare className="h-3.5 w-3.5" />
              )}
              Message {recipient}
            </button>
          </div>

          {/* On 18 September this button said "Send" beside a paper plane, in a
              drawer opened from a mail card, and was read as sending the email.
              It has never sent anything: it posts to the employee's queue. */}
          <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
            This goes to {recipient} inside Triangle. Nothing is emailed — the
            real Send is on the case.
          </p>

          {notice && <p className="mt-1.5 text-xs text-slate-500">{notice}</p>}
          {error && <p className="mt-1.5 text-xs text-rose-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
