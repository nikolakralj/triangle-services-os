"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquare } from "lucide-react";
import type { AssignmentMessage } from "@/lib/data/assignment-threads";
import type { AssignmentWork } from "@/lib/data/assignment-work";
import { caseWorkIsYours } from "@/lib/data/case-work-status";

// ---------------------------------------------------------------------------
// The conversation on one assignment.
//
// Collapsed by default and fetched on open — a workforce page with twenty jobs
// should not pull twenty threads nobody is reading.
//
// What this is NOT is a chat window. It opened on a scroll of everything
// anybody had written, so the one thing a person needed — whose move is it —
// had to be inferred by reading a Grok write-up to the end, and nobody did.
// Two things fix that, and both are about what a person reads first:
//
//   the status, from the record: queued and not picked up, working,
//   answered and back with you, or stopped;
//
//   the last word, open; everything before it folded. The history is still
//   here and still complete, it is just not the first thing in the way.
//
// The honesty that matters here is delivery. Triangle can webhook-wake a
// bot-runtime employee when you post, but that is a pickup request, not a
// chat send. A follow-up stays "not picked up yet" until the agent fetches
// the thread (or answers in it). If the wake is missing or fails, they pick
// it up on the next scheduled inbox check.
// ---------------------------------------------------------------------------

/** Longer than this and a reply is folded to its opening, with a way to open it. */
const LONG_REPLY = 520;

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
  const [work, setWork] = useState<AssignmentWork | null>(null);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // "the commercial manager" reads right; "the Bob" does not. A label is a
  // common noun and takes the article, a name does not.
  const recipientPhrase = recipientLabel ? `the ${recipientLabel}` : agentName;

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/assignments/${assignmentId}/messages`);
      const data = (await res.json().catch(() => ({}))) as {
        messages?: AssignmentMessage[];
        work?: AssignmentWork | null;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not load the conversation.");
        return;
      }
      setMessages(data.messages ?? []);
      setWork(data.work ?? null);
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
          work?: AssignmentWork | null;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "Could not load the conversation.");
          setMessages([]);
          return;
        }
        setMessages(data.messages ?? []);
        setWork(data.work ?? null);
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
        work?: AssignmentWork | null;
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
      setWork(data.work ?? null);
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

          {work && <WorkStatus work={work} />}

          {messages && messages.length > 0 && (
            <div className="mb-3 space-y-2">
              {/* Everything before the last word, folded. The record is whole;
                  it is just no longer the first thing a person has to read. */}
              {messages.length > 1 && (
                <details className="group rounded-lg border border-slate-200 bg-white">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-1.5 text-[11px] text-slate-500 transition hover:text-slate-800">
                    <span className="font-mono transition group-open:rotate-90">▸</span>
                    Earlier in this case · {messages.length - 1}
                  </summary>
                  <ul className="space-y-2 border-t border-slate-100 p-2">
                    {messages.slice(0, -1).map((m) => (
                      <ThreadMessage key={m.id} message={m} agentName={agentName} />
                    ))}
                  </ul>
                </details>
              )}
              <ul>
                <ThreadMessage
                  message={messages[messages.length - 1]}
                  agentName={agentName}
                  latest
                />
              </ul>
            </div>
          )}

          {messages && messages.length === 0 && !loading && (
            <p className="mb-3 text-xs text-slate-500">
              Nothing said yet. Ask {recipientPhrase} anything about this case.
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
                  ? `Ask ${recipientPhrase} to clarify or continue`
                  : `Give ${recipientPhrase} additional direction`
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
              Message {recipientPhrase}
            </button>
          </div>

          {/* On 18 September this button said "Send" beside a paper plane, in a
              drawer opened from a mail card, and was read as sending the email.
              It has never sent anything: it posts to the employee's queue. */}
          <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
            This goes to {recipientPhrase} inside Triangle. Nothing is emailed — the
            real Send is on the case.
          </p>

          {notice && <p className="mt-1.5 text-xs text-slate-500">{notice}</p>}
          {error && <p className="mt-1.5 text-xs text-rose-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Whose move it is, before anything else in the drawer.
 *
 * Read from the record on the server. A queued row says queued even when the
 * employee has written plenty in a chat somewhere else — what is not in
 * Triangle did not happen here.
 */
function WorkStatus({ work }: { work: AssignmentWork }) {
  const yours = caseWorkIsYours(work.state);
  return (
    <p
      className={`mb-3 flex items-start gap-2 rounded-lg px-3 py-2 text-[12px] leading-snug ${
        yours
          ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200"
          : "bg-sky-50 text-sky-900 ring-1 ring-sky-200"
      }`}
    >
      <span
        aria-hidden
        className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
          yours ? "bg-emerald-500" : "bg-sky-500"
        }`}
      />
      <span>
        <span className="font-semibold">{work.withLabel}.</span> {work.statusLine}
      </span>
    </p>
  );
}

/**
 * One message. A long reply is folded to its opening rather than printed
 * whole: Bob's write-ups run to several screens, and a drawer that opens on
 * one is a wall, not a case.
 */
function ThreadMessage({
  message,
  agentName,
  latest = false,
}: {
  message: AssignmentMessage;
  agentName: string;
  latest?: boolean;
}) {
  const [full, setFull] = useState(false);
  const long = message.body.length > LONG_REPLY;
  const shown = long && !full ? `${message.body.slice(0, LONG_REPLY).trimEnd()}…` : message.body;

  return (
    <li
      className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${
        message.role === "human"
          ? "bg-white text-slate-700 ring-1 ring-slate-200"
          : "bg-sky-50 text-slate-800"
      }`}
    >
      <p className="mb-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
        <span className="font-medium text-slate-600">
          {message.authorName ?? (message.role === "human" ? "You" : agentName)}
        </span>
        <span suppressHydrationWarning>
          {new Date(message.createdAt).toLocaleString([], {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        {latest && <span className="text-slate-400">· last word</span>}
        {message.role === "human" && !message.deliveredAt && (
          <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-800">
            not picked up yet
          </span>
        )}
      </p>
      <p className="whitespace-pre-wrap">{shown}</p>
      {long && (
        <button
          type="button"
          onClick={() => setFull((v) => !v)}
          className="mt-1 text-[11px] font-medium text-sky-700 hover:text-sky-900"
        >
          {full ? "Fold it back" : "Read all of it"}
        </button>
      )}
    </li>
  );
}
