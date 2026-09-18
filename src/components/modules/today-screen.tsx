"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Check,
  Copy,
  Loader2,
  Mail,
  Phone,
  Undo2,
  X,
} from "lucide-react";
import type { NextMove, NextMoveAction, OfferWorker } from "@/lib/data/next-move";
import type { CameBackItem } from "@/lib/data/came-back";
import type { FollowUp } from "@/lib/data/follow-ups";
import {
  mailtoHref,
  outcomeSentence,
  outcomesFor,
  telHref,
  type ContactOutcome,
} from "@/lib/data/contact-channels";
import { AgentReport } from "@/components/modules/agent-report";
import { EditableWords } from "@/components/modules/editable-words";
import type { MissionTab, ReadyToContact } from "@/lib/data/mission-shared";
import type { DoneItem } from "@/lib/data/today-in-progress";
import { DoneSince, InProgressByEmployee, ReadyForYou } from "@/components/modules/today-missions";
import { CertExceptions } from "@/components/modules/today-certs";
import type { CertAlertRow } from "@/lib/data/worker-documents";
import { EmailCardActions } from "@/components/modules/today-email-actions";
import {
  SendFromTriangleButton,
  SendFromTriangleReview,
  type AttachablePack,
} from "@/components/modules/send-from-triangle";
import { TodayHandoffProvider } from "@/components/modules/today-handoff-context";
import {
  chaseWaits,
  findDone,
  findWait,
  matchesIds,
  type CaseRef,
  type InProgressWait,
} from "@/lib/data/today-handoff";
import { mayAttachPack, type PutForwardCase } from "@/lib/data/put-forward";
import { CaseDecision, type DecisionChase } from "@/components/modules/case-decision";

// ---------------------------------------------------------------------------
// One inbox. Needs you, then In progress, then Done since you looked.
//
//   pulse        one line: how much needs you, who is working on what
//   01  NEEDS YOU    human decisions only — the hero card and the rest
//   02  IN PROGRESS  one quiet line per employee; the rows open on demand
//   03  DONE         what came back since you looked; older reports folded
//
// Missions live on the Missions page; the ones that ask something are already
// in Needs you. The operating-shell decision (16 September) took the mission
// grid, the second Ask box and the "on file" counts off this page.
//
// Handoff changes the owner of the work. It does not change where it lives.
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
  missions,
  ready,
  followUps,
  waits,
  done,
  certs = [],
  sender = null,
  senders = [],
  putForward = [],
}: {
  move: NextMove;
  employees: Employee[];
  cameBack: CameBackItem[];
  /** Open missions, as their tabs show them. */
  missions: MissionTab[];
  /** People a mission made reachable that nobody has contacted yet. */
  ready: ReadyToContact[];
  /** Sends and unanswered calls whose follow-up date has come. */
  followUps: { items: FollowUp[]; total: number };
  /** Open Bob / Scout / Hanna waits — quiet In progress, not Needs you. */
  waits: InProgressWait[];
  /** Work outside missions finished in the last day. */
  done: DoneItem[];
  /** Worker certificates expired or expiring within 30 days (DEV-011). */
  certs?: CertAlertRow[];
  /** This person's mailbox with Send from Triangle on (DEV-013), or null. */
  sender?: { id: string; emailAddress: string } | null;
  /** Every address this person may send from, when they own more than one. */
  senders?: Array<{ id: string; emailAddress: string; displayName?: string | null }>;
  /** Open and recently finished "who we put forward" cases (Hanna's half). */
  putForward?: PutForwardCase[];
}) {
  const [logged, setLogged] = useState<LoggedAttempt | null>(null);
  const decisions = cameBack.filter((i) => i.state !== null);
  const older = cameBack.filter((i) => i.state === null);
  const nowAction = move.action;
  // Who owns the chase. Hanna's who-we-put-forward job is the other half of
  // the same case and has its own block on the card; counting it here would
  // read as "somebody else is handling this" and take the card off Needs you.
  const chase = chaseWaits(waits);
  const nowIds = nowAction
    ? { leadId: nowAction.leadId, contactId: nowAction.contactId }
    : null;
  const nowWait = nowIds ? findWait(chase, nowIds) : null;
  // The same card stays when Bob has it (DEV-015). Needs you is only the
  // human decision — Send now, not the wait itself.
  const nowShowCard = Boolean(nowAction && !move.clear);
  const nowNeedsYou = Boolean(nowShowCard && !nowWait);
  const due = followUps.items.filter(
    (f) =>
      !nowAction ||
      !(
        (f.target.leadId && f.target.leadId === nowAction.leadId) ||
        (f.target.contactId && f.target.contactId === nowAction.contactId)
      ),
  );
  const dueMore = Math.max(0, followUps.total - followUps.items.length);

  // The same filters Needs you applies, so the pulse counts what is shown.
  const asking = missions.filter((m) => m.state === "needs_you" || m.state === "blocked");
  const dueOpen = due.filter(
    (f) =>
      !findWait(chase, {
        leadId: f.target.leadId,
        contactId: f.target.contactId,
        personId: f.target.personId,
      }),
  );
  const reachableOpen = ready.filter(
    (p) => !findWait(chase, { personId: p.contactId, contactId: p.contactId }),
  );
  const needsYou =
    (nowNeedsYou ? 1 : 0) +
    asking.length +
    dueOpen.length +
    (dueOpen.length > 0 ? dueMore : 0) +
    reachableOpen.length +
    certs.length;
  const finishedMissions = missions.filter((m) => m.state === "ready");
  const cameBackCount = decisions.length + older.length;

  const cardKey = move.action?.leadId || move.action?.contactId || move.headline;

  return (
    <TodayHandoffProvider>
    <div className="space-y-7">
      <Pulse
        needsYou={needsYou}
        waits={waits}
        doneCount={finishedMissions.length + done.length}
      />
      <Zone n="01" name="Needs you" note="human decisions only" id="today-needs-you">
        <div className="space-y-2">
          {logged && (
            <RecordedStrip
              key={logged.actionId}
              logged={logged}
              onClear={() => setLogged(null)}
            />
          )}
          {nowShowCard ? (
            <NowCard
              key={cardKey}
              move={move}
              onLogged={setLogged}
              waits={chase}
              done={done}
              sender={sender}
              senders={senders}
              putForward={putForward}
            />
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white px-6 py-6 text-center">
              <p className="text-base font-semibold text-slate-900">{move.headline}</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{move.because}</p>
            </div>
          )}
        </div>
        <div className="mt-3">
          <ReadyForYou
            people={ready}
            missions={missions}
            followUps={due}
            moreFollowUps={dueMore}
            waits={waits}
            putForward={putForward}
          />
        </div>
        {certs.length > 0 && (
          <div className="mt-3">
            <CertExceptions certs={certs} />
          </div>
        )}
      </Zone>

      <Zone
        n="02"
        name="In progress"
        note={waits.length === 0 ? "nothing with the team" : "quiet — open a line if you want to"}
        id="today-in-progress"
      >
        <InProgressByEmployee waits={waits} />
      </Zone>

      <Zone
        n="03"
        name="Done since you looked"
        note={
          finishedMissions.length + done.length === 0
            ? "nothing new"
            : "a mission leaves once opened"
        }
        id="today-done"
      >
        <DoneSince missions={finishedMissions} done={done}>
          {/* Reports filed before missions existed. They can still carry a
              decision, so they stay reachable — folded under what came back,
              not a zone of their own. */}
          {cameBackCount > 0 && (
            <details className="group rounded-2xl border border-slate-200 bg-white">
              <summary className="flex cursor-pointer list-none items-center gap-2.5 px-4 py-3 text-[13px] text-slate-600 transition hover:bg-slate-50">
                <span className="font-mono text-[11px] text-slate-400 transition group-open:rotate-90">
                  ▸
                </span>
                <span>
                  Older reports from before missions:{" "}
                  <span className="font-semibold text-slate-900">{decisions.length}</span>{" "}
                  {decisions.length === 1 ? "waits" : "wait"} for a decision
                  {older.length > 0
                    ? `, ${older.length} older ${older.length === 1 ? "item" : "items"}`
                    : ""}
                </span>
              </summary>
              <div className="border-t border-slate-100 p-2.5">
                <CameBackList decisions={decisions} older={older} />
              </div>
            </details>
          )}
        </DoneSince>
      </Zone>
    </div>
    </TodayHandoffProvider>
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

const PULSE_TONE = {
  need: "bg-amber-50 text-amber-900 ring-amber-200",
  calm: "bg-white text-slate-600 ring-slate-200",
  work: "bg-sky-50 text-sky-900 ring-sky-200",
  done: "bg-emerald-50 text-emerald-900 ring-emerald-200",
} as const;

/**
 * Today in one line, before any card: how much needs you, who is busy, and
 * whether anything came back. Counted from what the zones below show.
 */
function Pulse({
  needsYou,
  waits,
  doneCount,
}: {
  needsYou: number;
  waits: InProgressWait[];
  doneCount: number;
}) {
  const employees: Array<{ name: string; emoji: string; count: number }> = [];
  for (const wait of waits) {
    const known = employees.find((e) => e.name === wait.agentName);
    if (known) known.count += 1;
    else employees.push({ name: wait.agentName, emoji: wait.agentEmoji, count: 1 });
  }
  const chip = "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-medium ring-1 ring-inset";

  function go(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Today at a glance">
      <button
        type="button"
        onClick={() => go("today-needs-you")}
        className={`${chip} ${needsYou > 0 ? PULSE_TONE.need : PULSE_TONE.calm}`}
      >
        {needsYou === 0 ? "Nothing needs you" : `${needsYou} ${needsYou === 1 ? "needs" : "need"} you`}
      </button>
      {employees.map((e) => (
        <button
          key={e.name}
          type="button"
          onClick={() => go("today-in-progress")}
          className={`${chip} ${PULSE_TONE.work}`}
        >
          <span aria-hidden>{e.emoji}</span>
          {e.name} on {e.count}
        </button>
      ))}
      {doneCount > 0 && (
        <button
          type="button"
          onClick={() => go("today-done")}
          className={`${chip} ${PULSE_TONE.done}`}
        >
          {doneCount} done since you looked
        </button>
      )}
    </div>
  );
}

function Zone({
  n,
  name,
  note,
  id,
  children,
}: {
  n: string;
  name: string;
  note: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id}>
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
  waits,
  done,
  sender,
  senders,
  putForward,
}: {
  move: NextMove;
  onLogged: (logged: LoggedAttempt) => void;
  waits: InProgressWait[];
  done: DoneItem[];
  sender: { id: string; emailAddress: string } | null;
  senders: Array<{ id: string; emailAddress: string; displayName?: string | null }>;
  putForward: PutForwardCase[];
}) {
  if (move.clear || !move.action) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-6 text-center">
        <p className="text-base font-semibold text-slate-900">{move.headline}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{move.because}</p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl bg-slate-950 shadow-lg shadow-slate-900/10 ring-1 ring-slate-900/5">
      <div className="px-6 pt-6">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400">
          {move.action.channelKind === "phone" ? "Call" : "Reply"} · highest commercial leverage
        </p>
        {/* The one piece of large type on the page. */}
        <h3 className="mt-2.5 max-w-2xl text-[22px] font-semibold leading-[1.2] tracking-[-0.02em] text-white">
          {move.headline}
        </h3>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-slate-400">
          {move.because}
        </p>
      </div>
      <ActionPanel
        action={move.action}
        onLogged={onLogged}
        waits={waits}
        done={done}
        sender={sender}
        senders={senders}
        putForward={putForward}
      />
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
  waits,
  done,
  sender,
  senders,
  putForward,
}: {
  action: NextMoveAction;
  onLogged: (logged: LoggedAttempt) => void;
  waits: InProgressWait[];
  done: DoneItem[];
  /** This person's mailbox with sending on (DEV-013); null keeps Open mail only. */
  sender: { id: string; emailAddress: string } | null;
  senders: Array<{ id: string; emailAddress: string; displayName?: string | null }>;
  /** Hanna's who-we-put-forward cases, matched to this case below. */
  putForward: PutForwardCase[];
}) {
  const router = useRouter();
  const [reviewing, setReviewing] = useState(false);
  const [logging, setLogging] = useState<ContactOutcome | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isPhone = action.channelKind === "phone";
  const outcomes = outcomesFor(action.channelKind);
  const putForwardHere = putForward.filter((item) =>
    matchesIds(item, { leadId: action.leadId, contactId: action.contactId }),
  );
  // The newest who-we-put-forward case on this card — the one an Ask rebinds.
  const hannaCase =
    [...putForwardHere].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  const candidates = action.candidates ?? [];
  // Who the reply is about is the team's decision: Hanna's person when she has
  // the case, otherwise Triangle's own top match. Changing it is words in Ask.
  const decidedId = hannaCase?.pack?.workerId ?? action.offering?.workerId ?? "";
  const decidedOffer: OfferWorker | null =
    candidates.find((c) => c.workerId === decidedId) ??
    (action.offering?.workerId === decidedId ? action.offering : null) ??
    null;
  const pick = decidedOffer ?? (hannaCase ? null : (action.offering ?? null));
  const draftFor = (offer: OfferWorker | null) =>
    offer && offer.workerId !== action.offering?.workerId
      ? rewriteBackground(action.script ?? "", offer.why)
      : (action.script ?? "");

  // A written message can be changed before it goes; what is in the box is
  // what Open mail and Send use. A call script is only read out.
  const [words, setWords] = useState(() => draftFor(decidedOffer));
  const [autoWords, setAutoWords] = useState(() => draftFor(decidedOffer));
  // When the team's decision changes under an untouched draft, the draft follows.
  const [wordsFor, setWordsFor] = useState(decidedId);
  if (wordsFor !== decidedId) {
    setWordsFor(decidedId);
    if (words === autoWords) {
      const next = draftFor(decidedOffer);
      setWords(next);
      setAutoWords(next);
    }
  }
  const outgoing = isPhone ? (action.script ?? "") : words;
  const about = [action.personRole, action.country ? `in ${action.country}` : null]
    .filter(Boolean)
    .join(" ");
  const sendTarget = {
    to: action.value,
    subject: action.subject,
    body: outgoing,
    draft: action.script,
    who: action.personName,
    leadId: action.leadId,
    contactId: action.contactId || undefined,
    workerId: decidedId || undefined,
  };
  const nowWait = findWait(waits, {
    leadId: action.leadId,
    contactId: action.contactId,
  });
  const nowDone = findDone(done, {
    leadId: action.leadId,
    contactId: action.contactId,
  });
  const caseRef: CaseRef = {
    who: action.personName,
    about: action.personRole,
    leadId: action.leadId,
    contactId: action.contactId || null,
  };
  // What the Send review may offer to attach: an approved pack on this case,
  // or the nearest one so the review can say what is still missing.
  const attachable = attachablePackFrom(putForwardHere);

  // Bob's half of the case, as the decision block reads it.
  const chase: DecisionChase | null = nowWait
    ? {
        assignmentId: nowWait.assignmentId,
        agentName: nowWait.agentName,
        title: nowWait.title,
        body: nowWait.lastAgentBody,
        working: true,
        messageCount: nowWait.messageCount,
        awaitingAgent: nowWait.awaitingAgent,
      }
    : nowDone
      ? {
          assignmentId: nowDone.assignmentId,
          agentName: nowDone.agentName,
          title: nowDone.title,
          body: nowDone.lastAgentBody || nowDone.resultSummary,
          working: false,
          messageCount: nowDone.messageCount,
          awaitingAgent: nowDone.awaitingAgent,
        }
      : null;

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
          content: outgoing.trim() || undefined,
          draft: action.script ?? undefined,
          subject: action.subject ?? undefined,
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
          <>
            {/* Review / edit / Send in Triangle (DEV-013). Open mail is the
                primary way out only for a person with no sending mailbox;
                otherwise it is a quiet link beside Send. */}
            <SendFromTriangleButton
              target={sendTarget}
              sender={sender}
              open={reviewing}
              onOpen={() => {
                setReviewing(true);
                setError(null);
              }}
            />
            <a
              href={mailtoHref(action.value, action.subject, outgoing)}
              className={
                sender
                  ? "text-[12.5px] font-medium text-slate-300 underline-offset-2 transition hover:text-white hover:underline"
                  : "inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3.5 py-2 text-[13px] font-semibold text-sky-950 transition hover:bg-sky-400"
              }
            >
              {!sender && <Mail className="h-3.5 w-3.5" />}
              {sender ? "or open in your mail" : "Open mail"}
            </a>
          </>
        )}
      </div>

      <div className="space-y-4 px-6 py-5">
        <CaseDecision
          tone="dark"
          caseRef={caseRef}
          putForward={hannaCase}
          pick={pick}
          others={candidates}
          agency={action.leadId ? action.company : null}
          chase={chase}
        />

        {reviewing && sender && !isPhone && (
          <SendFromTriangleReview
            target={sendTarget}
            sender={sender}
            senders={senders}
            replyFrom={action.receivedIn ?? null}
            pack={attachable}
            onCancel={() => setReviewing(false)}
            onSent={(sent) => {
              setReviewing(false);
              onLogged({ actionId: sent.actionId, sentence: sent.sentence, who: sent.who, about });
              router.refresh();
            }}
          />
        )}

        {/* The prepared words, set as a document rather than a paragraph. */}
        {action.script &&
          (isPhone ? (
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/40 px-4 py-3.5 font-mono text-[12.5px] leading-[1.75] text-slate-300">
              {action.script}
            </pre>
          ) : (
            <EditableWords
              value={words}
              original={action.script}
              onChange={setWords}
              tone="dark"
              label="The reply to send"
            />
          ))}

        {isPhone ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What happened? (optional)"
              className="h-9 min-w-[12rem] grow rounded-lg border border-white/10 bg-white/[0.04] px-3 text-[13px] text-slate-200 placeholder-slate-600 transition focus:border-white/25 focus:bg-white/[0.07] focus:outline-none"
            />
            <div className="flex overflow-hidden rounded-lg border border-white/15">
              {outcomes.map(({ outcome, label, tone: outcomeTone }, i) => (
                <button
                  key={outcome}
                  type="button"
                  disabled={logging !== null}
                  onClick={() => void log(outcome)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium transition disabled:opacity-40 ${TONE[outcomeTone]} ${
                    i > 0 ? "border-l border-white/15" : ""
                  }`}
                >
                  {logging === outcome && <Loader2 className="h-3 w-3 animate-spin" />}
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <EmailCardActions
            tone="dark"
            target={{
              who: action.personName,
              about: [action.personRole, action.country ? `in ${action.country}` : null]
                .filter(Boolean)
                .join(" "),
              leadId: action.leadId,
              contactId: action.contactId || undefined,
              channelKind: action.channelKind,
              value: action.value,
              subject: action.subject,
              words: outgoing,
              draft: action.script,
            }}
            onRecorded={(recorded) =>
              onLogged({
                actionId: recorded.actionId,
                sentence: recorded.sentence,
                who: recorded.who,
                about: [action.personRole, action.country ? `in ${action.country}` : null]
                  .filter(Boolean)
                  .join(" "),
              })
            }
            alreadyWith={nowWait}
          />
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

/**
 * The pack the Send review should talk about: an approved one if there is
 * one, otherwise the newest with a document, so the review can name what is
 * still missing rather than going quiet.
 */
function attachablePackFrom(items: PutForwardCase[]): AttachablePack | null {
  const withDocument = items.filter((item) => item.pack !== null);
  const chosen =
    withDocument.find((item) => mayAttachPack(item.approval)) ?? withDocument[0];
  if (!chosen?.pack) return null;
  return {
    assignmentId: chosen.assignmentId,
    approval: chosen.approval,
    intent: chosen.intent,
    who: chosen.pack.displayName,
    filename: chosen.pack.filename,
    href: chosen.pack.href,
    agentName: chosen.agentName,
    approvedAt: chosen.approvedAt,
  };
}

function rewriteBackground(script: string, why: string): string {
  if (!why.trim()) return script;
  const line = `Relevant background: ${why}.`;
  if (/Relevant background:.*?(?=\n|$)/.test(script)) {
    return script.replace(/Relevant background:.*?(?=\n|$)/, line);
  }
  return script;
}

// ── 04 · BACK FROM THE TEAM ─────────────────────────────────────────────────

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
