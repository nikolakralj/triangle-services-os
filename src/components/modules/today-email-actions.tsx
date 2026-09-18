"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, MessageSquare, Undo2 } from "lucide-react";
import {
  EMAIL_DISMISS_ADVANCED,
  EMAIL_DISMISS_OPTIONS,
  dismissSentence,
  type EmailDismissReason,
} from "@/lib/data/today-card-actions";
import { useTodayHandoff, type ThreadTarget } from "@/components/modules/today-handoff-context";
import { AssignmentThreadDrawer } from "@/components/modules/assignment-thread-drawer";
import { type HandoffIds, type InProgressWait } from "@/lib/data/today-handoff";

// ---------------------------------------------------------------------------
// Open mail stays on the channel bar. These two are the human judgments:
// Ask Bob (hand the thread to Commercial Ops) and Dismiss (scoped, not a
// blacklist). Sent / They replied / Later are off this rail.
// ---------------------------------------------------------------------------

export interface EmailCardAlsoTarget {
  who?: string;
  about?: string | null;
  leadId?: string;
  contactId?: string;
  personId?: string;
  missionId?: string;
  companyId?: string;
  actionId?: string;
  channelKind?: string;
  value?: string;
  subject?: string | null;
  words?: string | null;
  draft?: string | null;
}

export interface EmailCardTarget {
  who: string;
  about?: string | null;
  leadId?: string;
  contactId?: string;
  personId?: string;
  missionId?: string;
  companyId?: string;
  actionId?: string;
  channelKind?: string;
  value: string;
  subject?: string | null;
  words?: string | null;
  draft?: string | null;
  /** Other roles on the same person/case. One Ask Bob / Dismiss covers them. */
  also?: EmailCardAlsoTarget[];
}

interface Recorded {
  actionId: string;
  sentence: string;
  who: string;
}

const TONE = {
  dark: {
    ask: "rounded-lg bg-sky-500 px-3.5 py-2 text-[13px] font-semibold text-sky-950 transition hover:bg-sky-400 disabled:opacity-40",
    dismiss:
      "inline-flex items-center gap-1 rounded-lg border border-white/15 px-3.5 py-2 text-[13px] font-medium text-slate-200 transition hover:bg-white/10 disabled:opacity-40",
    menu: "absolute right-0 z-20 mt-1 w-72 overflow-hidden rounded-xl border border-white/10 bg-slate-900 shadow-xl shadow-slate-950/40",
    item: "w-full px-3 py-2 text-left transition hover:bg-white/10",
    label: "text-[13px] font-medium text-slate-100",
    hint: "mt-0.5 text-[11px] leading-snug text-slate-500",
    advanced: "border-t border-white/10 text-[11px] text-slate-500",
    box: "rounded-xl border border-white/10 bg-black/40 p-3",
    input:
      "w-full resize-none bg-transparent text-[13px] leading-relaxed text-slate-100 placeholder-slate-600 focus:outline-none",
    send: "rounded-lg bg-sky-500 px-3 py-1.5 text-[12.5px] font-semibold text-sky-950 transition hover:bg-sky-400 disabled:opacity-40",
    cancel: "rounded-lg px-2 py-1.5 text-[12.5px] text-slate-400 transition hover:text-slate-200",
    error: "text-[13px] text-rose-400",
    note: "text-[11px] text-slate-500",
    with: "rounded-lg border border-sky-400/40 bg-sky-400/10 px-3 py-1.5 text-[12.5px] font-semibold text-sky-100",
    thread:
      "inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-[12.5px] font-semibold text-sky-950 transition hover:bg-sky-400 disabled:opacity-40",
    back: "inline-flex items-center gap-1 rounded-lg border border-white/15 px-3 py-1.5 text-[12.5px] font-medium text-slate-200 transition hover:bg-white/10 disabled:opacity-40",
  },
  light: {
    ask: "rounded-lg bg-slate-900 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40",
    dismiss:
      "inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40",
    menu: "absolute right-0 z-20 mt-1 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-900/10",
    item: "w-full px-3 py-2 text-left transition hover:bg-slate-50",
    label: "text-[13px] font-medium text-slate-900",
    hint: "mt-0.5 text-[11px] leading-snug text-slate-500",
    advanced: "border-t border-slate-100 text-[11px] text-slate-500",
    box: "rounded-xl border border-slate-200 bg-slate-50 p-3",
    input:
      "w-full resize-none bg-transparent text-[13px] leading-relaxed text-slate-900 placeholder-slate-400 focus:outline-none",
    send: "rounded-lg bg-slate-900 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40",
    cancel: "rounded-lg px-2 py-1.5 text-[12.5px] text-slate-500 transition hover:text-slate-800",
    error: "text-[12px] text-rose-600",
    note: "text-[11px] text-slate-500",
    with: "rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-[12.5px] font-semibold text-sky-900",
    thread:
      "inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40",
    back: "inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40",
  },
} as const;

export const EMAIL_CARD_NOTE =
  "Open mail sends nothing. Send from Triangle leaves from your own mailbox and records itself. They replied comes off this rail until the mailbox can observe it. Recorded outside Triangle is under Dismiss if you already handled this.";

function defaultAsk(target: EmailCardTarget): string {
  const who = target.who.trim() || "this person";
  const roles = [
    target.about,
    ...(target.also ?? []).map((item) => item.about),
  ].filter((value): value is string => Boolean(value && value.trim()));
  const unique = [...new Set(roles.map((value) => value.trim()))];
  if (unique.length > 0) return `Follow up with ${who} about ${unique.join("; ")}.`;
  return `Follow up with ${who}.`;
}

function handoffIdsOf(target: EmailCardTarget): HandoffIds[] {
  return [
    {
      leadId: target.leadId,
      contactId: target.contactId,
      personId: target.personId,
    },
    ...(target.also ?? []).map((item) => ({
      leadId: item.leadId,
      contactId: item.contactId,
      personId: item.personId,
    })),
  ];
}

export function EmailCardActions({
  target,
  tone = "light",
  onRecorded,
  alreadyWith = null,
  hideNote = false,
}: {
  target: EmailCardTarget;
  tone?: keyof typeof TONE;
  onRecorded: (recorded: Recorded) => void;
  alreadyWith?: InProgressWait | null;
  /** The card around these actions says it once for all of its lines. */
  hideNote?: boolean;
}) {
  const router = useRouter();
  const handoff = useTodayHandoff();
  const t = TONE[tone];
  const [asking, setAsking] = useState(false);
  const [instruction, setInstruction] = useState(defaultAsk(target));
  const [openDismiss, setOpenDismiss] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [handed, setHanded] = useState<{
    assignmentId: string;
    bobName: string;
    messageCount: number;
  } | null>(null);
  const [fallbackThread, setFallbackThread] = useState<ThreadTarget | null>(null);

  const withBob = alreadyWith
    ? {
        assignmentId: alreadyWith.assignmentId,
        bobName: alreadyWith.agentName,
        messageCount: alreadyWith.messageCount,
        awaitingAgent: alreadyWith.awaitingAgent,
        title: alreadyWith.title,
      }
    : handed
      ? {
          assignmentId: handed.assignmentId,
          bobName: handed.bobName,
          messageCount: handed.messageCount,
          awaitingAgent: 0,
          title: instruction.trim() || defaultAsk(target),
        }
      : null;

  function threadFrom(
    assignmentId: string,
    title: string,
    agentName: string,
    messageCount: number,
    awaitingAgent = 0,
  ): ThreadTarget {
    return { assignmentId, title, agentName, messageCount, awaitingAgent };
  }

  function openCaseThread(thread: ThreadTarget, pin: boolean) {
    if (handoff) {
      if (pin) handoff.announceHanded(thread, handoffIdsOf(target));
      else handoff.openThread(thread);
      return;
    }
    setFallbackThread(thread);
  }

  async function askBob() {
    const text = instruction.trim();
    if (text.length < 2) {
      setError("Write what Bob should do.");
      return;
    }
    setBusy("ask");
    setError(null);
    try {
      const res = await fetch("/api/ask/bob", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: text,
          who: target.who,
          about: target.about ?? undefined,
          leadId: target.leadId,
          contactId: target.contactId || undefined,
          personId: target.personId,
          companyId: target.companyId,
          missionId: target.missionId,
          channelKind: target.channelKind || "email",
          value: target.value,
          also: (target.also ?? [])
            .map((item) => ({
              leadId: item.leadId,
              contactId: item.contactId,
              personId: item.personId,
            }))
            .filter((item) => item.leadId || item.contactId || item.personId),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        assignmentId?: string;
        alreadyOut?: boolean;
        notice?: string;
        bobName?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Bob could not take that.");
        return;
      }
      if (!body.assignmentId) {
        setError("Bob took it, but no thread came back.");
        return;
      }
      const next = {
        assignmentId: body.assignmentId,
        bobName: body.bobName || "Bob",
        messageCount: 1,
      };
      setHanded(next);
      setAsking(false);
      openCaseThread(
        threadFrom(next.assignmentId, text, next.bobName, next.messageCount),
        true,
      );
      window.setTimeout(() => router.refresh(), 400);
    } catch {
      setError("Network error.");
    } finally {
      setBusy(null);
    }
  }

  async function takeBack(assignmentId: string) {
    setBusy("back");
    setError(null);
    try {
      const res = await fetch("/api/agents/assignments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not take it back.");
        return;
      }
      setHanded(null);
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(null);
    }
  }

  async function dismissOne(
    reason: EmailDismissReason,
    item: {
      channelKind?: string;
      value?: string;
      actionId?: string;
      leadId?: string;
      contactId?: string;
      personId?: string;
      missionId?: string;
      companyId?: string;
      words?: string | null;
      draft?: string | null;
      subject?: string | null;
    },
  ): Promise<{ ok: true; actionId: string | null; sentence?: string } | { ok: false; error: string }> {
    const res = await fetch("/api/today/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason,
        channelKind: item.channelKind || target.channelKind || "email",
        value: item.value || target.value,
        actionId: item.actionId,
        leadId: item.leadId,
        contactId: item.contactId || undefined,
        personId: item.personId,
        missionId: item.missionId,
        companyId: item.companyId,
        content: reason === "recorded_outside" ? item.words || undefined : undefined,
        draft: reason === "recorded_outside" ? item.draft || undefined : undefined,
        subject: item.subject || undefined,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      actionId?: string | null;
      sentence?: string;
    };
    if (!res.ok) {
      return { ok: false, error: body.error ?? "Could not dismiss that." };
    }
    return { ok: true, actionId: body.actionId ?? null, sentence: body.sentence };
  }

  async function dismiss(reason: EmailDismissReason) {
    setBusy(reason);
    setError(null);
    setOpenDismiss(false);
    try {
      const bundle = [target, ...(target.also ?? [])];
      let last: { actionId: string | null; sentence?: string } | null = null;
      for (const item of bundle) {
        const result = await dismissOne(reason, item);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        last = result;
      }
      onRecorded({
        actionId: last?.actionId || target.actionId || "dismissed",
        sentence: last?.sentence ?? dismissSentence(reason),
        who: target.who,
      });
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      {withBob ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={t.with}>
            {alreadyWith?.withLabel ?? `With ${withBob.bobName}`}
          </span>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              openCaseThread(
                threadFrom(
                  withBob.assignmentId,
                  withBob.title,
                  withBob.bobName,
                  withBob.messageCount,
                  withBob.awaitingAgent,
                ),
                false,
              )
            }
            className={t.thread}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Open thread
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void takeBack(withBob.assignmentId)}
            className={t.back}
          >
            {busy === "back" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Undo2 className="h-3 w-3" />
            )}
            Take back
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                setAsking((v) => !v);
                setOpenDismiss(false);
                setError(null);
              }}
              className={t.ask}
            >
              {busy === "ask" && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
              Ask Bob
            </button>
            <div className="relative">
              <button
                type="button"
                disabled={busy !== null}
                aria-expanded={openDismiss}
                onClick={() => {
                  setOpenDismiss((v) => !v);
                  setAsking(false);
                }}
                className={t.dismiss}
              >
                Dismiss
                <ChevronDown className="h-3 w-3" />
              </button>
              {openDismiss && (
                <div role="menu" className={t.menu}>
                  {EMAIL_DISMISS_OPTIONS.map((opt) => (
                    <button
                      key={opt.reason}
                      type="button"
                      role="menuitem"
                      disabled={busy !== null}
                      onClick={() => void dismiss(opt.reason)}
                      className={t.item}
                    >
                      <span className={t.label}>{opt.label}</span>
                      <span className={t.hint}>{opt.hint}</span>
                    </button>
                  ))}
                  <div className={t.advanced}>
                    {EMAIL_DISMISS_ADVANCED.map((opt) => (
                      <button
                        key={opt.reason}
                        type="button"
                        role="menuitem"
                        disabled={busy !== null}
                        onClick={() => void dismiss(opt.reason)}
                        className={t.item}
                      >
                        <span className={t.label}>{opt.label}</span>
                        <span className={t.hint}>{opt.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          {asking && (
            <div className={t.box}>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                rows={3}
                disabled={busy !== null}
                placeholder="What should Bob do?"
                className={t.input}
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy !== null || instruction.trim().length < 2}
                  onClick={() => void askBob()}
                  className={t.send}
                >
                  {busy === "ask" && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
                  Hand to Bob
                </button>
                <button type="button" onClick={() => setAsking(false)} className={t.cancel}>
                  Cancel
                </button>
              </div>
              <p className={`mt-2 ${t.note}`}>
                Hand to Bob keeps this card. The answer returns here — Open thread opens on this
                case.
              </p>
            </div>
          )}
        </>
      )}
      {!hideNote && (
        <p className={t.note}>
          {withBob
            ? "Bob has this case. The answer returns here — Open thread stays on this card."
            : EMAIL_CARD_NOTE}
        </p>
      )}
      {error && <p className={t.error}>{error}</p>}
      {!handoff && (
        <AssignmentThreadDrawer
          key={fallbackThread?.assignmentId ?? "closed"}
          thread={fallbackThread}
          onClose={() => setFallbackThread(null)}
        />
      )}
    </div>
  );
}
