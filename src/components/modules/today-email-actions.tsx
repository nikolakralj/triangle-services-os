"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import {
  EMAIL_DISMISS_ADVANCED,
  EMAIL_DISMISS_OPTIONS,
  dismissSentence,
  type EmailDismissReason,
} from "@/lib/data/today-card-actions";

// ---------------------------------------------------------------------------
// Open mail stays on the channel bar. These two are the human judgments:
// Ask Bob (hand the thread to Commercial Ops) and Dismiss (scoped, not a
// blacklist). Sent / They replied / Later are off this rail.
// ---------------------------------------------------------------------------

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
  },
} as const;

function defaultAsk(target: EmailCardTarget): string {
  const who = target.who.trim() || "this person";
  if (target.about) return `Follow up with ${who} about ${target.about}.`;
  return `Follow up with ${who}.`;
}

export function EmailCardActions({
  target,
  tone = "light",
  onRecorded,
}: {
  target: EmailCardTarget;
  tone?: keyof typeof TONE;
  onRecorded: (recorded: Recorded) => void;
}) {
  const router = useRouter();
  const t = TONE[tone];
  const [asking, setAsking] = useState(false);
  const [instruction, setInstruction] = useState(defaultAsk(target));
  const [openDismiss, setOpenDismiss] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          missionId: target.missionId,
          channelKind: target.channelKind || "email",
          value: target.value,
          dismissActionId: target.actionId,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        assignmentId?: string;
        alreadyOut?: boolean;
        notice?: string;
        dismissed?: { actionId: string | null };
      };
      if (!res.ok) {
        setError(body.error ?? "Bob could not take that.");
        return;
      }
      onRecorded({
        actionId: body.dismissed?.actionId || body.assignmentId || "asked",
        sentence: body.alreadyOut
          ? "Bob already has this"
          : "Asked Bob",
        who: target.who,
      });
      setAsking(false);
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(null);
    }
  }

  async function dismiss(reason: EmailDismissReason) {
    setBusy(reason);
    setError(null);
    setOpenDismiss(false);
    try {
      const res = await fetch("/api/today/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          channelKind: target.channelKind || "email",
          value: target.value,
          actionId: target.actionId,
          leadId: target.leadId,
          contactId: target.contactId || undefined,
          personId: target.personId,
          missionId: target.missionId,
          companyId: target.companyId,
          content: reason === "recorded_outside" ? target.words || undefined : undefined,
          draft: reason === "recorded_outside" ? target.draft || undefined : undefined,
          subject: target.subject || undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        actionId?: string | null;
        sentence?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Could not dismiss that.");
        return;
      }
      onRecorded({
        actionId: body.actionId || target.actionId || "dismissed",
        sentence: body.sentence ?? dismissSentence(reason),
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
        </div>
      )}
      <p className={t.note}>
        Open mail sends nothing. Sent and They replied come off this rail until
        the mailbox can observe them. Recorded outside Triangle is under Dismiss
        if you already handled this.
      </p>
      {error && <p className={t.error}>{error}</p>}
    </div>
  );
}
