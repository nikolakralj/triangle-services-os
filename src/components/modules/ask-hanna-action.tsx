"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquare, UserSearch } from "lucide-react";
import {
  DEFAULT_PACK_INTENT,
  defaultPutForwardAsk,
  packIntentLabel,
  parsePackIntent,
  type PackIntent,
} from "@/lib/data/put-forward";
import type { CaseRef } from "@/lib/data/today-handoff";
import { useTodayHandoff } from "@/components/modules/today-handoff-context";

// ---------------------------------------------------------------------------
// Ask Hanna, from the case that is already open.
//
// Bob chases the thread. Hanna says who we put forward and in which form. On
// 18 September saying "ask Hanna" inside Bob's thread produced nothing but a
// queued message he could not act on, so this is a real button that creates a
// real job — on the same case, never a second chat and never a Workforce hunt.
//
// The bio / full-CV choice is pre-set from the words the human wrote, and the
// radio is there because a parse is a guess and this one releases somebody's
// identity. Anonymised stays the default.
//
// This sends nothing. Hanna proposes; a person presses Send.
// ---------------------------------------------------------------------------

const TONE = {
  light: {
    button:
      "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40",
    box: "rounded-xl border border-slate-200 bg-slate-50 p-3",
    input:
      "w-full resize-none bg-transparent text-[13px] leading-relaxed text-slate-900 placeholder-slate-400 focus:outline-none",
    submit:
      "rounded-lg bg-slate-900 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40",
    cancel: "rounded-lg px-2 py-1.5 text-[12.5px] text-slate-500 transition hover:text-slate-800",
    choice: "flex cursor-pointer items-start gap-2 text-[12.5px] text-slate-800",
    note: "text-[11px] leading-snug text-slate-500",
    error: "text-[12px] text-rose-600",
    with: "rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-[12.5px] font-semibold text-violet-900",
    thread:
      "inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40",
  },
  dark: {
    button:
      "inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3.5 py-2 text-[13px] font-medium text-slate-200 transition hover:bg-white/10 disabled:opacity-40",
    box: "rounded-xl border border-white/10 bg-black/40 p-3",
    input:
      "w-full resize-none bg-transparent text-[13px] leading-relaxed text-slate-100 placeholder-slate-600 focus:outline-none",
    submit:
      "rounded-lg bg-violet-400 px-3 py-1.5 text-[12.5px] font-semibold text-violet-950 transition hover:bg-violet-300 disabled:opacity-40",
    cancel: "rounded-lg px-2 py-1.5 text-[12.5px] text-slate-400 transition hover:text-slate-200",
    choice: "flex cursor-pointer items-start gap-2 text-[12.5px] text-slate-200",
    note: "text-[11px] leading-snug text-slate-500",
    error: "text-[13px] text-rose-400",
    with: "rounded-lg border border-violet-400/40 bg-violet-400/10 px-3 py-1.5 text-[12.5px] font-semibold text-violet-100",
    thread:
      "inline-flex items-center gap-1.5 rounded-lg bg-violet-400 px-3 py-1.5 text-[12.5px] font-semibold text-violet-950 transition hover:bg-violet-300 disabled:opacity-40",
  },
} as const;

export const ASK_HANNA_NOTE =
  "Hanna owns who we put forward. Bio means initials only and a filename that is the Triangle reference. The answer returns on this case; you still press Send.";

export interface AskHannaHanded {
  assignmentId: string;
  hannaName: string;
  intent: PackIntent;
  worker: { id: string; name: string } | null;
  notice: string;
}

export function AskHannaAction({
  caseRef,
  fromAssignmentId,
  tone = "light",
  seedText,
  startOpen = false,
  label = "Ask Hanna",
  onHanded,
}: {
  caseRef: CaseRef;
  /** The Bob thread this was asked from, so the two halves stay joined. */
  fromAssignmentId?: string | null;
  tone?: keyof typeof TONE;
  /** Words the human already typed somewhere else, e.g. in Bob's composer. */
  seedText?: string | null;
  startOpen?: boolean;
  label?: string;
  onHanded?: (handed: AskHannaHanded) => void;
}) {
  const t = TONE[tone];
  const router = useRouter();
  const handoff = useTodayHandoff();
  const seed = seedText?.trim() || "";
  const seededIntent = useMemo<PackIntent>(
    () => (seed ? parsePackIntent(seed) : DEFAULT_PACK_INTENT),
    [seed],
  );
  const [open, setOpen] = useState(startOpen);
  const [instruction, setInstruction] = useState(
    seed ||
      defaultPutForwardAsk({
        who: caseRef.who,
        about: caseRef.about,
        intent: seededIntent,
      }),
  );
  // Until the human touches the radio, the words keep deciding. Typing
  // "initials only" after opening the box should move the choice with it.
  const [chosen, setChosen] = useState<PackIntent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handed, setHanded] = useState<AskHannaHanded | null>(null);
  const [ambiguous, setAmbiguous] = useState<string[]>([]);

  const intent = chosen ?? parsePackIntent(instruction);

  async function handToHanna() {
    const text = instruction.trim();
    if (text.length < 2) {
      setError("Write what Hanna should prepare.");
      return;
    }
    setBusy(true);
    setError(null);
    setAmbiguous([]);
    try {
      const res = await fetch("/api/ask/hanna", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: text,
          intent,
          who: caseRef.who,
          about: caseRef.about ?? undefined,
          leadId: caseRef.leadId ?? undefined,
          contactId: caseRef.contactId ?? undefined,
          personId: caseRef.personId ?? undefined,
          companyId: caseRef.companyId ?? undefined,
          missionId: caseRef.missionId ?? undefined,
          fromAssignmentId: fromAssignmentId ?? undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        assignmentId?: string;
        hannaName?: string;
        intent?: PackIntent;
        worker?: { id: string; name: string } | null;
        ambiguous?: string[];
        notice?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Hanna could not take that.");
        return;
      }
      if (!body.assignmentId) {
        setError("Hanna took it, but no thread came back.");
        return;
      }
      const next: AskHannaHanded = {
        assignmentId: body.assignmentId,
        hannaName: body.hannaName || "Hanna",
        intent: body.intent ?? intent,
        worker: body.worker ?? null,
        notice: body.notice ?? "",
      };
      setHanded(next);
      setAmbiguous(body.ambiguous ?? []);
      setOpen(false);
      onHanded?.(next);
      handoff?.announceHanded(
        {
          assignmentId: next.assignmentId,
          title: text,
          agentName: next.hannaName,
          messageCount: 1,
          awaitingAgent: 0,
          case: caseRef,
        },
        [caseRef],
      );
      window.setTimeout(() => router.refresh(), 400);
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  if (handed) {
    return (
      <div className="w-full space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={t.with}>
            With {handed.hannaName} · {packIntentLabel(handed.intent).toLowerCase()}
          </span>
          <button
            type="button"
            onClick={() =>
              handoff?.openThread({
                assignmentId: handed.assignmentId,
                title: instruction.trim(),
                agentName: handed.hannaName,
                messageCount: 1,
                awaitingAgent: 0,
                case: caseRef,
              })
            }
            className={t.thread}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Open thread
          </button>
        </div>
        {handed.worker && (
          <p className={t.note}>
            Bound to {handed.worker.name} from the books.
          </p>
        )}
        {ambiguous.length > 0 && (
          <p className={t.note}>
            More than one person matched ({ambiguous.join(", ")}), so nobody is bound yet —
            Hanna names the candidates.
          </p>
        )}
        {handed.notice && <p className={t.note}>{handed.notice}</p>}
      </div>
    );
  }

  return (
    <div className={open ? "w-full space-y-2" : undefined}>
      {!open && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setOpen(true);
            setError(null);
          }}
          className={t.button}
        >
          <UserSearch className="h-3.5 w-3.5" />
          {label}
        </button>
      )}
      {open && (
        <div className={t.box}>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={3}
            disabled={busy}
            placeholder="What should Hanna prepare?"
            className={t.input}
          />
          <fieldset className="mt-2 space-y-1">
            <legend className={t.note}>What goes out</legend>
            {(["bio_anonymised", "full_cv"] as PackIntent[]).map((option) => (
              <label key={option} className={t.choice}>
                <input
                  type="radio"
                  name={`put-forward-intent-${fromAssignmentId ?? caseRef.leadId ?? caseRef.contactId ?? caseRef.personId ?? "case"}`}
                  checked={intent === option}
                  onChange={() => setChosen(option)}
                  disabled={busy}
                  className="mt-0.5"
                />
                <span>{packIntentLabel(option)}</span>
              </label>
            ))}
          </fieldset>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={busy || instruction.trim().length < 2}
              onClick={() => void handToHanna()}
              className={t.submit}
            >
              {busy && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
              Hand to Hanna
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setOpen(false)}
              className={t.cancel}
            >
              Cancel
            </button>
          </div>
          <p className={`mt-2 ${t.note}`}>{ASK_HANNA_NOTE}</p>
          {error && <p className={`mt-1 ${t.error}`}>{error}</p>}
        </div>
      )}
    </div>
  );
}
