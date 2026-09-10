"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Check,
  Copy,
  CornerDownLeft,
  Loader2,
  Mail,
  Phone,
  Undo2,
  X,
} from "lucide-react";
import type { NextMove, NextMoveAction } from "@/lib/data/next-move";
import type { CameBackItem } from "@/lib/data/came-back";
import {
  outcomeSentence,
  outcomesFor,
  telHref,
  type ContactOutcome,
} from "@/lib/data/contact-channels";
import { AgentReport } from "@/components/modules/agent-report";

// ---------------------------------------------------------------------------
// One screen. Three zones. Numbered because it is a real order on the page.
//
//   01  NOW     the hero — one action, the only thing in colour
//   02  ASK     a console line: type, it answers underneath
//   03  BACK    a tight list with a state rail, not a stack of cards
//
// The first version of this worked and looked like every admin panel: one
// border radius, one shadow, one text size, white cards on a white page. Same
// weight for the one thing that matters today and for a row of history.
//
// Hierarchy is the whole job here. The NOW card is the only saturated surface
// on the page; ASK is a single deep input; BACK is rows on the page ground
// with a coloured rail carrying the state. Everything else is quiet so those
// three read in order at a glance.
//
// Type is Geist and Geist Mono, already the app's faces. Mono is used only
// where the content is data a human will copy or dial — addresses, numbers,
// the prepared words — which is also what makes the script look like a
// document rather than a paragraph.
//
// A click has to visibly do something. On 8 September the outcome buttons
// saved every time and showed nothing: the page refreshed into the next
// requisition, which was a copy of the same role, so the card looked untouched
// and the CEO reported that whatever he clicked, nothing happened. A strip now
// says what was recorded and offers Undo, and the card below it is a
// different role.
// ---------------------------------------------------------------------------

interface Employee {
  id: string;
  name: string;
  emoji: string;
  roleTitle: string | null;
}

/** What was just recorded from the NOW card, so it can be seen and taken back. */
interface LoggedAttempt {
  actionId: string;
  /** "Sent", "No answer", "They replied". */
  sentence: string;
  who: string;
  about: string;
}

export function TodayScreen({
  move,
  cameBack,
  counts,
}: {
  move: NextMove;
  employees: Employee[];
  cameBack: CameBackItem[];
  counts: { projects: number; companies: number; people: number };
}) {
  const [logged, setLogged] = useState<LoggedAttempt | null>(null);
  const decisions = cameBack.filter((i) => i.state !== null);
  const older = cameBack.filter((i) => i.state === null);

  // Keyed by what the card is about, so a new move is a new card: the note box
  // and the button state start empty instead of carrying over from the last
  // person.
  const cardKey = move.action?.leadId || move.action?.contactId || move.headline;

  return (
    <div className="space-y-7">
      <Zone n="01" name="Now" note="one action — the rest can wait">
        <div className="space-y-2">
          {logged && (
            <RecordedStrip
              key={logged.actionId}
              logged={logged}
              onClear={() => setLogged(null)}
            />
          )}
          <NowCard key={cardKey} move={move} onLogged={setLogged} />
        </div>
      </Zone>

      <Zone n="02" name="Ask" note="answers here, in about a minute">
        <AskConsole />
      </Zone>

      <Zone
        n="03"
        name="Back from the team"
        note={
          decisions.length === 0
            ? "nothing to decide"
            : `${decisions.length} to decide`
        }
      >
        <CameBackList decisions={decisions} older={older} />
      </Zone>

      {/* What is on file but not on the path to an order. Requisitions are
          deliberately not repeated here — the strip above already draws them,
          and printing the same number twice in two idioms is how the old
          screen ended up saying everything four times. */}
      <p className="border-t border-slate-200/80 pt-3 font-mono text-[11px] tracking-wide text-slate-400">
        on file · {counts.people} people · {counts.projects} projects ·{" "}
        {counts.companies} companies
      </p>
    </div>
  );
}

/**
 * "Recorded: Sent — Oliver Hall · PLC Commissioning Engineer in Ireland. Undo"
 *
 * The missing piece behind "whatever I click, nothing happens". The write
 * always succeeded; nothing on the page ever said so.
 */
function RecordedStrip({
  logged,
  onClear,
}: {
  logged: LoggedAttempt;
  onClear: () => void;
}) {
  const router = useRouter();
  const [state, setState] = useState<"recorded" | "undoing" | "undone">("recorded");
  const [error, setError] = useState<string | null>(null);

  async function undo() {
    setState("undoing");
    setError(null);
    try {
      const res = await fetch("/api/outreach/log", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: logged.actionId }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not undo it.");
        setState("recorded");
        return;
      }
      setState("undone");
      router.refresh();
    } catch {
      setError("Network error.");
      setState("recorded");
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-4 py-2.5 text-[13px] ${
        state === "undone"
          ? "border-slate-200 bg-white text-slate-600"
          : "border-emerald-200 bg-emerald-50 text-emerald-900"
      }`}
    >
      {state === "undone" ? (
        <span>Undone — {logged.who} is back on the list.</span>
      ) : (
        <span className="flex items-start gap-1.5">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <span>
            <span className="font-semibold">Recorded: {logged.sentence}</span> —{" "}
            {logged.who}
            {logged.about ? ` · ${logged.about}` : ""}. The card below is what is
            next.
          </span>
        </span>
      )}
      <span className="grow" />
      {state !== "undone" && (
        <button
          type="button"
          onClick={() => void undo()}
          disabled={state === "undoing"}
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-[12px] font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50"
        >
          {state === "undoing" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Undo2 className="h-3 w-3" />
          )}
          Undo
        </button>
      )}
      <button
        type="button"
        onClick={onClear}
        aria-label="Dismiss"
        className="rounded p-1 text-slate-400 transition hover:text-slate-700"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {error && <p className="w-full text-[12px] text-rose-700">{error}</p>}
    </div>
  );
}

function Zone({
  n,
  name,
  note,
  children,
}: {
  n: string;
  name: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2.5">
        <span className="font-mono text-[11px] font-medium tabular-nums text-sky-600">
          {n}
        </span>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
          {name}
        </h2>
        <span className="h-px grow bg-slate-200" />
        <span className="text-[11px] text-slate-400">{note}</span>
      </div>
      {children}
    </section>
  );
}

// ── 01 · NOW ────────────────────────────────────────────────────────────────

function NowCard({
  move,
  onLogged,
}: {
  move: NextMove;
  onLogged: (logged: LoggedAttempt) => void;
}) {
  if (move.clear || !move.action) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-8 text-center">
        <p className="text-base font-semibold text-slate-900">{move.headline}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{move.because}</p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl bg-slate-950 shadow-lg shadow-slate-900/10 ring-1 ring-slate-900/5">
      <div className="px-6 pt-6">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400">
          Highest commercial leverage
        </p>
        {/* The one piece of large type on the page. */}
        <h3 className="mt-2.5 max-w-2xl text-[22px] font-semibold leading-[1.2] tracking-[-0.02em] text-white">
          {move.headline}
        </h3>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-slate-400">
          {move.because}
        </p>
      </div>
      <ActionPanel action={move.action} onLogged={onLogged} />
    </div>
  );
}

const TONE: Record<"good" | "neutral" | "bad", string> = {
  good: "text-emerald-300 hover:bg-emerald-500/20",
  neutral: "text-slate-300 hover:bg-white/10",
  bad: "text-rose-300 hover:bg-rose-500/20",
};

/**
 * Dial or open mail, copy, then record what happened.
 *
 * The CEO's maximum effort is a copied email or picking up the phone, and the
 * three outcomes are the whole of the contact history — no stages, no scores,
 * no forms. The three words now fit the channel: "No answer" under an email
 * that had not been sent recorded a contact that never happened.
 */
function ActionPanel({
  action,
  onLogged,
}: {
  action: NextMoveAction;
  onLogged: (logged: LoggedAttempt) => void;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [logging, setLogging] = useState<ContactOutcome | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isPhone = action.channelKind === "phone";
  const outcomes = outcomesFor(action.channelKind);

  async function log(outcome: ContactOutcome) {
    setLogging(outcome);
    setError(null);
    try {
      const res = await fetch("/api/outreach/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: action.contactId || undefined,
          leadId: action.leadId,
          channelKind: action.channelKind,
          value: action.value,
          outcome,
          content: action.script ?? undefined,
          note: note.trim() || undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        actionId?: string;
      };
      if (!res.ok || !body.actionId) {
        setError(body.error ?? "Could not record that.");
        return;
      }
      onLogged({
        actionId: body.actionId,
        sentence: outcomeSentence(outcome, action.channelKind),
        who: action.personName,
        about: [action.personRole, action.country ? `in ${action.country}` : null]
          .filter(Boolean)
          .join(" "),
      });
      setNote("");
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setLogging(null);
    }
  }

  return (
    <div className="mt-5">
      {/* The channel bar — the thing you act on, lifted out of the prose. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-y border-white/10 bg-white/[0.04] px-6 py-3">
        {isPhone ? (
          <Phone className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
        ) : (
          <Mail className="h-3.5 w-3.5 shrink-0 text-sky-400" />
        )}
        <span className="font-mono text-[13px] text-slate-100">{action.value}</span>
        <span className="text-[11px] text-slate-500">{action.whose}</span>
        <span className="grow" />
        {isPhone ? (
          <a
            href={telHref(action.value)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-[13px] font-semibold text-emerald-950 transition hover:bg-emerald-400"
          >
            <Phone className="h-3.5 w-3.5" />
            Dial
          </a>
        ) : (
          <a
            href={`mailto:${action.value}${
              action.subject ? `?subject=${encodeURIComponent(action.subject)}` : ""
            }${action.script ? `&body=${encodeURIComponent(action.script)}` : ""}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3.5 py-2 text-[13px] font-semibold text-sky-950 transition hover:bg-sky-400"
          >
            <Mail className="h-3.5 w-3.5" />
            Open mail
          </a>
        )}
        {action.script && (
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(action.script ?? "");
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                setError("Could not reach the clipboard.");
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3.5 py-2 text-[13px] font-medium text-slate-200 transition hover:bg-white/10"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? "Copied" : "Copy pitch"}
          </button>
        )}
      </div>

      <div className="space-y-4 px-6 py-5">
        {action.offering && (
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-400">
              Who we put forward
            </p>
            <p className="mt-1.5 text-[15px] font-semibold text-white">
              {action.offering.name}
              {action.offering.role && (
                <span className="ml-2 text-[13px] font-normal text-slate-400">
                  {action.offering.role}
                </span>
              )}
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-400">
              {action.offering.why}
            </p>
            {/* What is NOT known about them, before it is offered to a buyer. */}
            {action.offering.caveats.length > 0 && (
              <ul className="mt-2.5 space-y-1">
                {action.offering.caveats.map((c) => (
                  <li
                    key={c}
                    className="flex items-start gap-2 text-[12px] leading-snug text-amber-300/90"
                  >
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                    {c}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* The prepared words, set as a document rather than a paragraph. */}
        {action.script && (
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/40 px-4 py-3.5 font-mono text-[12.5px] leading-[1.75] text-slate-300">
            {action.script}
          </pre>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What happened? (optional)"
            className="h-9 min-w-[12rem] grow rounded-lg border border-white/10 bg-white/[0.04] px-3 text-[13px] text-slate-200 placeholder-slate-600 transition focus:border-white/25 focus:bg-white/[0.07] focus:outline-none"
          />
          {/* One segmented control, not three loose buttons. */}
          <div className="flex overflow-hidden rounded-lg border border-white/15">
            {outcomes.map(({ outcome, label, tone }, i) => (
              <button
                key={outcome}
                type="button"
                disabled={logging !== null}
                onClick={() => void log(outcome)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium transition disabled:opacity-40 ${TONE[tone]} ${
                  i > 0 ? "border-l border-white/15" : ""
                }`}
              >
                {logging === outcome && <Loader2 className="h-3 w-3 animate-spin" />}
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Open mail hands the words to your mail program and sends nothing.
            Saying so here is what stops "Sent" being pressed for an email
            that is still sitting in a draft. */}
        {!isPhone && (
          <p className="text-[11px] text-slate-500">
            Open mail sends nothing by itself — press{" "}
            <span className="text-slate-300">Sent</span> once the email has actually
            gone.
          </p>
        )}

        {error && <p className="text-[13px] text-rose-400">{error}</p>}
        {action.history.length > 0 && (
          <p className="text-[11px] text-slate-500">
            {action.history.length}{" "}
            {action.history.length === 1 ? "attempt" : "attempts"} already recorded —
            last was{" "}
            {/* A null outcome means nobody wrote down how it went. Not the
                same as any of the three, so it is not dressed up as one. */}
            {action.history[0].outcome
              ? action.history[0].outcome.replace("_", " ")
              : "not written down"}
            .
          </p>
        )}
      </div>
    </div>
  );
}

// ── 02 · ASK ────────────────────────────────────────────────────────────────

interface AskAnswer {
  by: string;
  emoji: string;
  kind: "talent" | "research" | "refused" | "failed" | "queued";
  answer: string;
  people?: Array<{ id: string; name: string; role: string | null; status: string }>;
  partners?: Array<{ id: string; name: string; trades: string[]; crewSize: number | null }>;
  blockers?: string[];
  missing?: string[];
  state?: "reachable" | "one_thing_missing" | "dead" | null;
  person?: string | null;
  door?: string | null;
  words?: string | null;
  missingFact?: string | null;
  missingOwner?: string | null;
  deadReason?: string | null;
}

const EXAMPLES = [
  "Find HVAC and EPC contractors in Frankfurt needing subcontractors",
  "Two best electrical supervisors for a steel job in the USA",
  "Match our bench to the open g2 requisitions",
];

/**
 * One line. No employee to choose.
 *
 * The dispatch bar made the CEO pick Scout or Hanna from a dropdown before
 * typing, which asks him to know the org chart to ask a question. The routing
 * is server-side now, because it depends on what each employee can actually
 * do — the browser-side version created work for Hanna that `run-now` never
 * ran, so the box said "handed out" and nothing happened.
 */
function AskConsole() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask(text: string) {
    if (text.trim().length < 8 || busy) return;
    setBusy(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text.trim() }),
      });
      const body = (await res.json().catch(() => ({}))) as AskAnswer & {
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "That did not work.");
        return;
      }
      setAnswer(body);
      setQ("");
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(q);
        }}
        className="flex items-center gap-2 p-2"
      >
        <span className="pl-2 font-mono text-sm text-sky-600">›</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          disabled={busy}
          placeholder="Ask for anything — the market, or your own people"
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] text-slate-900 placeholder-slate-400 focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || q.trim().length < 8}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-4 text-[13px] font-semibold text-white transition hover:bg-slate-800 disabled:opacity-30"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CornerDownLeft className="h-3.5 w-3.5" />
          )}
          {busy ? "Working" : "Ask"}
        </button>
      </form>

      {!answer && !busy && !error && (
        <div className="flex flex-wrap gap-1.5 border-t border-slate-100 px-3 py-2.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => void ask(ex)}
              className="rounded-lg bg-slate-50 px-2.5 py-1 text-[12px] text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {busy && (
        <p className="border-t border-slate-100 px-4 py-3 text-[13px] text-slate-500">
          Working on it. Nothing is being sent to anyone.
        </p>
      )}

      {error && (
        <p className="border-t border-slate-100 px-4 py-3 text-[13px] text-rose-600">
          {error}
        </p>
      )}

      {answer && <AskAnswerBlock a={answer} />}
    </div>
  );
}

function AskAnswerBlock({ a }: { a: AskAnswer }) {
  const bad = a.kind === "refused" || a.kind === "failed";
  return (
    <div
      className={`border-t px-4 py-4 ${
        bad ? "border-amber-100 bg-amber-50/50" : "border-slate-100"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-sm">{a.emoji}</span>
        <span className="text-[12px] font-semibold text-slate-800">{a.by}</span>
        {a.state && (
          <span
            className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${
              STATE_CHIP[a.state]
            }`}
          >
            {STATE_LABEL[a.state]}
          </span>
        )}
        {bad && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-800">
            {a.kind === "refused" ? "Refused" : "Failed"}
          </span>
        )}
      </div>

      <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-slate-800">
        {a.answer}
      </p>

      {(a.people?.length || a.partners?.length) && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {a.people?.map((p) => (
            <span
              key={p.id}
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[12px] text-emerald-800"
            >
              {p.name}
              {p.role ? <span className="text-emerald-600"> · {p.role}</span> : null}
              {p.status === "candidate" && (
                <span className="text-emerald-600"> · off a CV</span>
              )}
            </span>
          ))}
          {a.partners?.map((p) => (
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

      {a.person && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
          <span className="text-[13px] font-medium text-slate-900">{a.person}</span>
          {a.door && (
            <a
              href={a.door}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono text-[12px] text-sky-700 hover:underline"
            >
              {a.door.replace(/^https?:\/\//, "").slice(0, 48)}
              <ArrowUpRight className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
      {a.words && (
        <p className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[12px] leading-relaxed text-slate-700">
          {a.words}
        </p>
      )}
      {a.missingFact && (
        <p className="mt-2 text-[12.5px] text-amber-800">
          <span className="font-semibold">Missing:</span> {a.missingFact}
          {a.missingOwner ? ` — ${a.missingOwner}` : ""}
        </p>
      )}
      {a.deadReason && (
        <p className="mt-2 text-[12.5px] italic text-slate-500">{a.deadReason}</p>
      )}

      {a.blockers && a.blockers.length > 0 && (
        <ul className="mt-2.5 space-y-1">
          {a.blockers.map((b) => (
            <li
              key={b}
              className="flex items-start gap-2 text-[12.5px] leading-snug text-amber-800"
            >
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
              {b}
            </li>
          ))}
        </ul>
      )}
      {a.missing && a.missing.length > 0 && (
        <p className="mt-2 text-[12px] text-slate-500">
          Nobody has recorded: {a.missing.join("; ")}.
        </p>
      )}
    </div>
  );
}

// ── 03 · BACK FROM THE TEAM ─────────────────────────────────────────────────

const STATE_LABEL: Record<string, string> = {
  reachable: "Reachable",
  one_thing_missing: "One thing missing",
  dead: "Dead",
};

const STATE_CHIP: Record<string, string> = {
  reachable: "bg-emerald-100 text-emerald-800",
  one_thing_missing: "bg-amber-100 text-amber-800",
  dead: "bg-rose-100 text-rose-800",
};

const STATE_RAIL: Record<string, string> = {
  reachable: "bg-emerald-500",
  one_thing_missing: "bg-amber-500",
  dead: "bg-rose-400",
};

function CameBackList({
  decisions,
  older,
}: {
  decisions: CameBackItem[];
  older: CameBackItem[];
}) {
  if (decisions.length === 0 && older.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-300 px-5 py-8 text-center text-[13px] text-slate-500">
        Nothing waiting. Ask for something above and it appears here.
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      {decisions.length > 0 ? (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {decisions.map((item) => (
            <CameBackRow key={item.key} item={item} />
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-slate-300 px-5 py-6 text-center text-[13px] text-slate-500">
          Nothing needs a decision.
        </p>
      )}

      {/* Items filed before the contract carry no state, so they are not
          decisions — there is nothing for them to be a decision about. Thirty
          of them above the two that matter would recreate the old Agent Desk
          with better fonts. */}
      {older.length > 0 && (
        <details className="group overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[13px] text-slate-500 transition hover:bg-slate-50">
            <span className="font-mono text-[11px] tabular-nums text-slate-400 transition group-open:rotate-90">
              ▸
            </span>
            <span className="font-medium text-slate-700">{older.length}</span> older
            {older.length === 1 ? " item" : " items"}, filed before findings had to
            say what they were
          </summary>
          <div className="divide-y divide-slate-100 border-t border-slate-100">
            {older.map((item) => (
              <CameBackRow key={item.key} item={item} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function CameBackRow({ item }: { item: CameBackItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState<string | null>(null);

  // Follow-up work already out for this item. The button used to be offered
  // again while Scout was still working, and a second press made a second job.
  const fetching =
    item.handedOff !== null &&
    (item.handedOff.status === "queued" || item.handedOff.status === "active");
  const answeredByScout = item.handedOff?.status === "completed";

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/came-back", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Only what identifies the record and what the human decided. The
        // missing fact and the title used to travel from the browser and were
        // trusted; the server reads them from the record now.
        body: JSON.stringify({ action, kind: item.kind, id: item.id, ...extra }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        alreadyOut?: boolean;
        warning?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "That did not work.");
        return;
      }
      setDone(
        action === "send_back"
          ? body.alreadyOut
            ? "Scout already has this — the answer will land here."
            : "Sent to Scout — the answer will land here."
          : action === "discard"
            ? "Discarded with your reason. It will not come back."
            : "Filed. It will not come back.",
      );
      if (body.warning) setError(body.warning);
      setDiscarding(false);
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex gap-0">
      {/* The state, as a rail rather than a floating pill. Scannable down the
          left edge without reading a word. */}
      <span
        aria-hidden
        className={`w-[3px] shrink-0 ${
          item.state ? STATE_RAIL[item.state] : "bg-slate-200"
        }`}
      />
      <div className="min-w-0 grow px-4 py-3.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className="text-[14px] font-semibold tracking-[-0.01em] text-slate-900">
            {item.title}
          </p>
          {item.state ? (
            <span
              className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${
                STATE_CHIP[item.state]
              }`}
            >
              {STATE_LABEL[item.state]}
            </span>
          ) : null}
          <span className="grow" />
          <span className="font-mono text-[11px] text-slate-400">
            {item.authorEmoji} {item.authorName}
          </span>
        </div>

        <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-slate-600">
          {item.line}
        </p>

        {item.missing && (
          <p className="mt-2 text-[12.5px] text-amber-800">
            <span className="font-semibold">Missing:</span> {item.missing.fact}
            <span className="text-amber-600"> — {item.missing.owner}</span>
          </p>
        )}

        {item.deadReason && (
          <p className="mt-2 text-[12.5px] italic text-slate-500">{item.deadReason}</p>
        )}

        {item.reach && (
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="font-mono text-[12.5px] text-slate-900">
              {item.reach.value}
            </span>
            {item.reach.howToOpen && (
              <span className="text-[12px] text-slate-500">
                {item.reach.howToOpen}
              </span>
            )}
          </div>
        )}

        {done ? (
          <p className="mt-2.5 text-[12.5px] font-medium text-emerald-700">{done}</p>
        ) : (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {item.state === "reachable" && item.reach && (
              <>
                {item.reach.value.includes("@") ? (
                  <a
                    href={`mailto:${item.reach.value}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-slate-800"
                  >
                    <Mail className="h-3 w-3" />
                    Open mail
                  </a>
                ) : item.reach.kind === "link" ? (
                  <a
                    href={item.reach.value}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-slate-800"
                  >
                    Open the page
                    <ArrowUpRight className="h-3 w-3" />
                  </a>
                ) : (
                  <a
                    href={telHref(item.reach.value)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-slate-800"
                  >
                    <Phone className="h-3 w-3" />
                    Dial
                  </a>
                )}
                {item.reach.howToOpen && (
                  <button
                    type="button"
                    onClick={() =>
                      navigator.clipboard.writeText(item.reach?.howToOpen ?? "")
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    <Copy className="h-3 w-3" />
                    Copy the words
                  </button>
                )}
              </>
            )}

            {item.state === "one_thing_missing" && item.missing && fetching && (
              <span className="inline-flex items-center gap-1.5 text-[12.5px] text-slate-600">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                Scout is fetching it — the answer will land here.
              </span>
            )}

            {item.state === "one_thing_missing" && item.missing && answeredByScout && (
              <span className="text-[12.5px] text-slate-500">
                Scout came back on this — the report is in this list.
              </span>
            )}

            {item.state === "one_thing_missing" &&
              item.missing &&
              !fetching &&
              !answeredByScout && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void act("send_back")}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40"
                >
                  {busy === "send_back" && <Loader2 className="h-3 w-3 animate-spin" />}
                  Send Scout back for it
                </button>
              )}

            {item.state === "dead" && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void act("file_refusal")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
              >
                {busy === "file_refusal" && (
                  <Loader2 className="h-3 w-3 animate-spin" />
                )}
                File the refusal
              </button>
            )}

            {item.state !== "dead" && (
              <button
                type="button"
                onClick={() => setDiscarding((v) => !v)}
                className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-slate-500 transition hover:bg-rose-50 hover:text-rose-700"
              >
                Discard
              </button>
            )}

            {item.sourceUrl && (
              <a
                href={item.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg px-2 py-1.5 text-[12.5px] text-slate-400 transition hover:text-slate-700"
              >
                Source
              </a>
            )}

            {item.fullReport && (
              <details className="w-full">
                <summary className="cursor-pointer py-1 text-[12.5px] text-sky-700 hover:underline">
                  The whole report
                </summary>
                <div className="mt-2">
                  <AgentReport
                    text={item.fullReport}
                    authorName={item.authorName}
                    authorEmoji={item.authorEmoji}
                  />
                </div>
              </details>
            )}
          </div>
        )}

        {/* A discard needs a reason, or the same lead is back next week —
            which is the exact failure the dead state exists to prevent. */}
        {discarding && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50/70 p-2">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why? Wrong trade, no buyer, wrong country…"
              className="h-8 min-w-[10rem] grow rounded-lg border border-rose-200 bg-white px-2.5 text-[12.5px] text-slate-900 placeholder-rose-300 focus:border-rose-400 focus:outline-none"
            />
            <button
              type="button"
              disabled={busy !== null || reason.trim().length < 3}
              onClick={() => void act("discard", { reason: reason.trim() })}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-700 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-rose-600 disabled:opacity-40"
            >
              {busy === "discard" && <Loader2 className="h-3 w-3 animate-spin" />}
              Discard for good
            </button>
          </div>
        )}

        {error && <p className="mt-2 text-[12.5px] text-rose-600">{error}</p>}
      </div>
    </div>
  );
}
