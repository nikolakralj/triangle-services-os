"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, CornerDownLeft, Loader2, Pin, Plus, Sparkles, X } from "lucide-react";
import type { MissionTab } from "@/lib/data/mission-shared";
import { MissionMark, StateGlyph } from "@/components/missions/mission-state";
import {
  useAskPageContext,
  type AskPageContextValue,
  type AskRecordContext,
} from "@/components/missions/ask-context";

// ---------------------------------------------------------------------------
// The one box, on every page.
//
// Ctrl+K (⌘K on a Mac), or the bar in the top of every screen. Type what you
// need. A question about Triangle's own people is answered right here; any
// other thing is work, so it becomes a mission — or goes into the mission you
// point it at — and you land on that mission while the worker starts.
// With a record in view (DEV-010), that work is a missionless assignment on
// the record: the box says "On Stahlwerk Linz", the person stays on the page,
// and the answer returns under the record's case. Inside a mission, the box
// defaults to that mission. With nothing in view, work is a mission as before.
//
// There is no employee to pick. The first command bar made the CEO choose
// Scout or Hanna from a dropdown before typing, which asks him to know the
// org chart to ask a question.
//
// The dialog is portalled to <body>. It was first rendered inside the top bar,
// whose backdrop blur makes it the containing block for fixed children — so
// the "full-screen" dialog was clipped to the bar and the page painted over
// it. A screenshot caught what the text assertions passed.
// ---------------------------------------------------------------------------

export const ASK_EVENT = "triangle:ask";

/** Open the box from anywhere: the tab strip's +, a Today card, an empty state. */
export function openAsk(detail: { missionId?: string | null; text?: string } = {}) {
  window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail }));
}

interface TalentAnswer {
  by: string;
  emoji: string;
  kind: "talent";
  answer: string;
  people: Array<{ id: string; name: string; role: string | null; status: string }>;
  partners: Array<{ id: string; name: string; trades: string[]; crewSize: number | null }>;
  blockers: string[];
  missing: string[];
}

const EXAMPLES = [
  "Find EPC and electrical contractors in Germany that buy automation and commissioning labour",
  "Find three PCS7 engineers from our pool who could start in October",
  "Who on our bench has worked on a steel plant?",
];

/** What the box lands on when it opens with nothing said about a target. */
function defaultTarget(page: AskPageContextValue | null): { missionId: string | null; onRecord: boolean } {
  if (page?.kind === "mission") return { missionId: page.missionId, onRecord: false };
  if (page?.kind === "record") return { missionId: null, onRecord: true };
  return { missionId: null, onRecord: false };
}

export function AskLauncher() {
  const [open, setOpen] = useState(false);
  const page = useAskPageContext();
  const [initial, setInitial] = useState<{ missionId: string | null; text: string; onRecord: boolean }>({
    missionId: null,
    text: "",
    onRecord: false,
  });
  // Read at render; the server guesses "Ctrl K" and a Mac corrects it.
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setInitial({ ...defaultTarget(page), text: "" });
        setOpen(true);
      }
    };
    const onAsk = (e: Event) => {
      const d = (e as CustomEvent<{ missionId?: string | null; text?: string }>).detail ?? {};
      // An explicit mission wins; otherwise the page decides where it goes.
      const target =
        d.missionId !== undefined ? { missionId: d.missionId, onRecord: false } : defaultTarget(page);
      setInitial({ ...target, text: d.text ?? "" });
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(ASK_EVENT, onAsk);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(ASK_EVENT, onAsk);
    };
  }, [page]);

  const record = page?.kind === "record" ? page : null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setInitial({ ...defaultTarget(page), text: "" });
          setOpen(true);
        }}
        className="group flex h-10 w-full max-w-3xl items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-left text-sm text-slate-500 transition hover:border-slate-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
      >
        <Sparkles className="h-4 w-4 shrink-0 text-sky-600" />
        <span className="flex-1 truncate">
          {record
            ? `Ask about your people, or give the team work on ${record.label}…`
            : "Ask about your people, or give the team work…"}
        </span>
        <kbd
          suppressHydrationWarning
          className="hidden rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-500 sm:inline"
        >
          {mac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>
      {open &&
        createPortal(
          <AskDialog
            key={`${initial.missionId ?? "new"}:${initial.onRecord ? record?.id ?? "" : ""}:${initial.text}`}
            initial={initial}
            record={record}
            onClose={() => setOpen(false)}
          />,
          document.body,
        )}
    </>
  );
}

/** What came back when work was bound to the record in view. */
interface HandedOnRecord {
  lead: string;
  emoji: string;
  label: string;
  alreadyOut: boolean;
  notice: string;
}

function AskDialog({
  initial,
  record,
  onClose,
}: {
  initial: { missionId: string | null; text: string; onRecord: boolean };
  /** The record the page shows, if any. */
  record: AskRecordContext | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [text, setText] = useState(initial.text);
  const [missionId, setMissionId] = useState<string | null>(initial.missionId);
  const [onRecord, setOnRecord] = useState(Boolean(record) && initial.onRecord);
  const [tabs, setTabs] = useState<MissionTab[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<TalentAnswer | null>(null);
  const [handed, setHanded] = useState<HandedOnRecord | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    input.current?.focus();
    let alive = true;
    fetch("/api/missions", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { tabs: [] }))
      .then((b: { tabs?: MissionTab[] }) => {
        if (alive) setTabs(b.tabs ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const target = tabs.find((t) => t.id === missionId) ?? null;
  const bound = onRecord && record ? record : null;
  const minimum = missionId ? 2 : 8;
  const ready = text.trim().length >= minimum && !busy;

  async function submit() {
    const question = text.trim();
    if (!ready) return;
    setBusy(true);
    setError(null);
    setAnswer(null);
    setHanded(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          missionId: missionId ?? undefined,
          context:
            bound && !missionId
              ? {
                  type: bound.type,
                  id: bound.id,
                  label: bound.label,
                  projectId: bound.projectId ?? null,
                  companyId: bound.companyId ?? null,
                }
              : undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        kind?: "mission" | "talent" | "assignment";
        missionId?: string;
        lead?: string;
        emoji?: string;
        label?: string;
        alreadyOut?: boolean;
        notice?: string;
      } & Partial<Omit<TalentAnswer, "kind">>;
      if (!res.ok) {
        setError(body.error ?? "That did not work.");
        return;
      }
      if (body.kind === "mission" && body.missionId) {
        onClose();
        router.push(`/missions/${body.missionId}`);
        router.refresh();
        return;
      }
      if (body.kind === "assignment") {
        // Stay here. The page underneath re-renders with the new job on its
        // case; the box says so and offers to close.
        setHanded({
          lead: body.lead ?? "The team",
          emoji: body.emoji ?? "🤖",
          label: body.label ?? bound?.label ?? "this record",
          alreadyOut: Boolean(body.alreadyOut),
          notice: body.notice ?? "",
        });
        setText("");
        router.refresh();
        return;
      }
      if (body.kind === "talent") {
        setAnswer(body as TalentAnswer);
        setText("");
        return;
      }
      setError("Something came back that this box does not understand.");
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ask the team"
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/40 px-4 pb-10 pt-[10vh] backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl shadow-slate-950/20 ring-1 ring-slate-900/10">
        <div className="flex items-start gap-3 px-5 pt-5">
          <Sparkles className="mt-1 h-4 w-4 shrink-0 text-sky-600" />
          <textarea
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={3}
            disabled={busy}
            placeholder={
              target
                ? `Tell the ${target.title} mission what to do next…`
                : bound
                  ? `What should the team do about ${bound.label}?`
                  : "What do you need? Work for the team, or a question about your people"
            }
            className="min-h-[76px] w-full resize-none bg-transparent text-[16px] leading-relaxed text-slate-900 placeholder-slate-400 focus:outline-none disabled:opacity-60"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Where it goes. The record in view by default when there is one,
            otherwise a new mission; one click puts it inside a mission. */}
        <div className="flex flex-wrap items-center gap-1.5 px-5 pb-3.5 pt-2">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Goes to
          </span>
          {record && (
            <TargetChip
              active={bound !== null && missionId === null}
              onClick={() => {
                setOnRecord(true);
                setMissionId(null);
              }}
            >
              <Pin className="h-3 w-3" />
              <span className="max-w-[200px] truncate">On {record.label}</span>
            </TargetChip>
          )}
          <TargetChip
            active={missionId === null && bound === null}
            onClick={() => {
              setOnRecord(false);
              setMissionId(null);
            }}
          >
            <Plus className="h-3 w-3" />
            New mission
          </TargetChip>
          {tabs.map((t) => (
            <TargetChip
              key={t.id}
              active={missionId === t.id}
              onClick={() => {
                setOnRecord(false);
                setMissionId(t.id);
              }}
            >
              <MissionMark emoji={t.emoji} size="sm" />
              <span className="max-w-[160px] truncate">{t.title}</span>
              <StateGlyph state={t.state} />
            </TargetChip>
          ))}
        </div>

        {handed && (
          <div className="border-t border-slate-100 bg-emerald-50/60 px-5 py-3.5">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-emerald-900">
              <Check className="h-4 w-4" />
              {handed.alreadyOut
                ? `${handed.emoji} ${handed.lead} already has ${handed.label}`
                : `${handed.emoji} ${handed.lead} has it — on ${handed.label}`}
            </p>
            <p className="mt-1 text-[12.5px] leading-snug text-emerald-800">
              You stay here. The answer returns under this record&apos;s case history, not on a
              new mission.{handed.notice ? ` ${handed.notice}` : ""}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 text-[12px] font-semibold text-emerald-900 underline-offset-2 hover:underline"
            >
              Back to the page
            </button>
          </div>
        )}

        {!text && !answer && !handed && !target && (
          <div className="border-t border-slate-100 px-5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              For example
            </p>
            <div className="mt-2 flex flex-col items-start gap-1">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => {
                    setText(ex);
                    input.current?.focus();
                  }}
                  className="rounded-md px-2 py-1 text-left text-[13px] text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {answer && <TalentAnswerBlock a={answer} />}

        {error && (
          <p className="border-t border-rose-100 bg-rose-50/70 px-5 py-2.5 text-[13px] text-rose-700">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3 border-t border-slate-100 bg-slate-50/80 px-5 py-3">
          <p className="flex-1 text-[12px] leading-snug text-slate-500">
            {busy
              ? missionId
                ? "Handing it over…"
                : bound
                  ? "Handing it over…"
                  : "Reading it and naming the work…"
              : target
                ? "It reads the whole mission — the conversation and everything found so far — before it starts."
                : bound
                  ? `A question about your own people is answered here. Anything else becomes one job on ${bound.label}; you stay on this page and the answer returns on its case.`
                  : "A question about your own people is answered here. Anything else becomes a mission you can keep talking to."}
          </p>
          <button
            type="button"
            disabled={!ready}
            onClick={() => void submit()}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 text-[13px] font-semibold text-white transition hover:bg-slate-800 disabled:opacity-30"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CornerDownLeft className="h-3.5 w-3.5" />
            )}
            {busy ? "Working" : target || bound ? "Send" : "Go"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TargetChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-medium ring-1 ring-inset transition ${
        active
          ? "bg-slate-900 text-white ring-slate-900"
          : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

function TalentAnswerBlock({ a }: { a: TalentAnswer }) {
  return (
    <div className="max-h-[40vh] overflow-y-auto border-t border-slate-100 px-5 py-4">
      <p className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-800">
        <span>{a.emoji}</span>
        {a.by}
      </p>
      <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-slate-800">{a.answer}</p>
      {(a.people.length > 0 || a.partners.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {a.people.map((p) => (
            <span
              key={p.id}
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[12px] text-emerald-800"
            >
              {p.name}
              {p.role ? <span className="text-emerald-600"> · {p.role}</span> : null}
            </span>
          ))}
          {a.partners.map((p) => (
            <span
              key={p.id}
              className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[12px] text-sky-800"
            >
              {p.name}
              <span className="text-sky-600">
                {" · partner"}
                {p.crewSize !== null ? ` · up to ${p.crewSize}` : ""}
              </span>
            </span>
          ))}
        </div>
      )}
      {a.blockers.length > 0 && (
        <ul className="mt-3 space-y-1">
          {a.blockers.map((b) => (
            <li key={b} className="flex items-start gap-2 text-[12.5px] leading-snug text-amber-800">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
              {b}
            </li>
          ))}
        </ul>
      )}
      {a.missing.length > 0 && (
        <p className="mt-2 text-[12px] text-slate-500">Nobody has recorded: {a.missing.join("; ")}.</p>
      )}
    </div>
  );
}
