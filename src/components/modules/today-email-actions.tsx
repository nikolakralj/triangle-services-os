"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, MessageSquare } from "lucide-react";
import {
  EMAIL_DISMISS_ADVANCED,
  EMAIL_DISMISS_OPTIONS,
  dismissSentence,
  type EmailDismissReason,
} from "@/lib/data/today-card-actions";
import { useTodayHandoff, type ThreadTarget } from "@/components/modules/today-handoff-context";
import { AssignmentThreadDrawer } from "@/components/modules/assignment-thread-drawer";
import { DEFAULT_CASE_ASK } from "@/lib/data/case-ask-routing";
import {
  withLabelFor,
  type CaseRef,
  type HandoffIds,
  type InProgressWait,
} from "@/lib/data/today-handoff";

// ---------------------------------------------------------------------------
// The judgments on a mail card: one Ask, and Dismiss.
//
//   Ask       say what you want, once. Triangle decides who takes it — Bob
//             for the conversation, Hanna for who we put forward and in which
//             form, both when the words need both — and the answer comes back
//             on this card ("Employees, not buttons", 18 September).
//   Dismiss   scoped, not a blacklist.
//
// Who has the case shows as "With Bob" / "With Hanna"; pressing it opens that
// thread, where Take back lives. Nothing here sends anything: Send is a
// person, on the card.
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
  /** Other roles on the same person/case. One Ask / Dismiss covers them. */
  also?: EmailCardAlsoTarget[];
}

interface Recorded {
  actionId: string;
  sentence: string;
  who: string;
}

/** One employee holding part of this case, as the card shows it. */
interface Holder {
  assignmentId: string;
  agentName: string;
  label: string;
  title: string;
  messageCount: number;
  awaitingAgent: number;
}

/** What POST /api/ask/case answers. */
interface AskAnswer {
  error?: string;
  handed?: Array<{
    employee: string;
    half: "chase" | "put_forward";
    assignmentId: string;
    how: "new" | "thread";
    notice: string;
    changed: string[];
  }>;
  refused?: Array<{ employee: string; error: string }>;
  ambiguous?: string[];
  sentence?: string;
}

const TONE = {
  dark: {
    ask: "inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3.5 py-2 text-[13px] font-semibold text-sky-950 transition hover:bg-sky-400 disabled:opacity-40",
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
    said: "text-[12.5px] leading-snug text-sky-100",
    with: "inline-flex items-center gap-1.5 rounded-lg border border-sky-400/40 bg-sky-400/10 px-3 py-1.5 text-[12.5px] font-semibold text-sky-100 transition hover:bg-sky-400/20",
  },
  light: {
    ask: "inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40",
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
    said: "text-[12.5px] leading-snug text-slate-700",
    with: "inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-[12.5px] font-semibold text-sky-900 transition hover:bg-sky-100",
  },
} as const;

export const EMAIL_CARD_NOTE =
  "Ask says what you want — the team decides who takes it, and the answer comes back on this card. Nothing leaves Triangle until you press Send.";

const ASK_PLACEHOLDER =
  "Say what you want — “propose the best fit as a bio”, “did they answer?”, “use Luka instead”, “follow up, don't send yet”.";

function caseRefOf(target: EmailCardTarget): CaseRef {
  return {
    who: target.who,
    about: target.about ?? null,
    leadId: target.leadId ?? null,
    contactId: target.contactId ?? null,
    personId: target.personId ?? null,
    companyId: target.companyId ?? null,
    missionId: target.missionId ?? null,
  };
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

/** The sentence under the card after an Ask: who has it, and anything the words changed or could not settle. */
function answerSentence(body: AskAnswer): string {
  const parts = [body.sentence ?? ""];
  for (const handed of body.handed ?? []) {
    if (handed.changed.length > 0) {
      parts.push(`${handed.employee}'s part now: ${handed.changed.join(", ")}.`);
    }
  }
  if ((body.ambiguous ?? []).length > 0) {
    parts.push(`More than one person matched (${(body.ambiguous ?? []).join(", ")}) — say which.`);
  }
  for (const refused of body.refused ?? []) {
    parts.push(`${refused.employee} could not take it: ${refused.error}`);
  }
  return parts.filter(Boolean).join(" ");
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
  const [instruction, setInstruction] = useState(alreadyWith ? "" : DEFAULT_CASE_ASK);
  const [openDismiss, setOpenDismiss] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [handed, setHanded] = useState<Holder[]>([]);
  const [said, setSaid] = useState<string | null>(null);
  const [fallbackThread, setFallbackThread] = useState<ThreadTarget | null>(null);

  const holders: Holder[] = [];
  if (alreadyWith) {
    holders.push({
      assignmentId: alreadyWith.assignmentId,
      agentName: alreadyWith.agentName,
      label: alreadyWith.withLabel,
      title: alreadyWith.title,
      messageCount: alreadyWith.messageCount,
      awaitingAgent: alreadyWith.awaitingAgent,
    });
  }
  for (const holder of handed) {
    if (!holders.some((h) => h.assignmentId === holder.assignmentId)) holders.push(holder);
  }

  function threadOf(holder: Holder): ThreadTarget {
    return {
      assignmentId: holder.assignmentId,
      title: holder.title,
      agentName: holder.agentName,
      messageCount: holder.messageCount,
      awaitingAgent: holder.awaitingAgent,
      case: caseRefOf(target),
    };
  }

  function openCaseThread(thread: ThreadTarget, pin: boolean, handedTo?: string) {
    if (handoff) {
      if (pin) handoff.announceHanded({ ...thread, handedTo }, handoffIdsOf(target));
      else handoff.openThread(thread);
      return;
    }
    setFallbackThread(thread);
  }

  async function askTeam() {
    const text = instruction.trim();
    if (text.length < 2) {
      setError("Write what the team should do.");
      return;
    }
    setBusy("ask");
    setError(null);
    try {
      const res = await fetch("/api/ask/case", {
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
      const body = (await res.json().catch(() => ({}))) as AskAnswer;
      if (!res.ok || !body.handed?.length) {
        setError(body.error ?? "The team could not take that.");
        return;
      }
      const next: Holder[] = body.handed.map((h) => ({
        assignmentId: h.assignmentId,
        agentName: h.employee,
        label: withLabelFor("", h.employee),
        title: text,
        messageCount: 1,
        awaitingAgent: 1,
      }));
      setHanded((prev) => [
        ...prev.filter((p) => !next.some((n) => n.assignmentId === p.assignmentId)),
        ...next,
      ]);
      setSaid(answerSentence(body));
      setAsking(false);
      setInstruction("");
      // The conversation's thread first: that is where the reply is drafted.
      const primary =
        next[body.handed.findIndex((h) => h.half === "chase")] ?? next[0];
      openCaseThread(
        threadOf(primary),
        true,
        [...new Set(body.handed.map((h) => h.employee))].join(" and "),
      );
      window.setTimeout(() => router.refresh(), 400);
    } catch {
      setError("Network error. Nothing was handed over.");
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
      {holders.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {holders.map((holder) => (
            <button
              key={holder.assignmentId}
              type="button"
              disabled={busy !== null}
              onClick={() => openCaseThread(threadOf(holder), false)}
              title={`Open ${holder.agentName}'s thread on this case`}
              className={t.with}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {holder.label || withLabelFor("", holder.agentName)}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={busy !== null}
          aria-expanded={asking}
          onClick={() => {
            setAsking((v) => !v);
            setOpenDismiss(false);
            setError(null);
          }}
          className={t.ask}
        >
          {busy === "ask" && <Loader2 className="h-3 w-3 animate-spin" />}
          Ask
        </button>
        {holders.length === 0 && (
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
        )}
      </div>

      {asking && (
        <div className={t.box}>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={3}
            disabled={busy !== null}
            placeholder={ASK_PLACEHOLDER}
            aria-label="What the team should do"
            className={t.input}
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={busy !== null || instruction.trim().length < 2}
              onClick={() => void askTeam()}
              className={t.send}
            >
              {busy === "ask" && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
              Give it to the team
            </button>
            <button type="button" onClick={() => setAsking(false)} className={t.cancel}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {said && <p className={t.said}>{said}</p>}
      {!hideNote && (
        <p className={t.note}>
          {holders.length > 0
            ? "The team has this case. What they decide comes back on this card — Ask again to change it."
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
