"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Check,
  Clock,
  Copy,
  Link2,
  Loader2,
  Mail,
  Phone,
  Undo2,
  UserRound,
  X,
  MessageSquare,
} from "lucide-react";
import { ago, hostOf, type MissionTab, type ReadyToContact } from "@/lib/data/mission-shared";
import type { FollowUp } from "@/lib/data/follow-ups";
import type { DoneItem } from "@/lib/data/today-in-progress";
import {
  mailtoHref,
  outcomeSentence,
  outcomesFor,
  telHref,
  type ContactOutcome,
} from "@/lib/data/contact-channels";
import { EditableWords } from "@/components/modules/editable-words";
import { MissionMark, StateGlyph } from "@/components/missions/mission-state";
import { EMAIL_CARD_NOTE, EmailCardActions } from "@/components/modules/today-email-actions";
import { findWait, type InProgressWait } from "@/lib/data/today-handoff";
import { useTodayHandoff } from "@/components/modules/today-handoff-context";

// ---------------------------------------------------------------------------
// What the missions put on Today.
//
// "Today only receives items requiring human action." So: the people a
// mission made reachable that nobody has contacted, with the number and the
// words, and the missions that asked something or stopped. Everything behind
// them — the companies, the sources, the conversation — stays in the mission,
// one click away on every row.
// ---------------------------------------------------------------------------

interface Recorded {
  actionId: string;
  sentence: string;
  who: string;
}

/**
 * What kind of decision a Needs you card asks for, in the same place on every
 * card: Reply, Follow up, Call, Write, Decide. The first piece of one card shape.
 */
export function KindChip({ kind }: { kind: string }) {
  return (
    <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-800">
      {kind}
    </span>
  );
}

const WHOSE = {
  person: "their own",
  department: "department",
  switchboard: "switchboard",
} as const;

export function ReadyForYou({
  people,
  missions,
  followUps = [],
  moreFollowUps = 0,
  waits = [],
}: {
  people: ReadyToContact[];
  missions: MissionTab[];
  /** Sends and unanswered calls whose follow-up date has come. */
  followUps?: FollowUp[];
  /** Due beyond the ones listed. */
  moreFollowUps?: number;
  /** Open Bob / Scout / Hanna waits — those cards belong in In progress. */
  waits?: InProgressWait[];
}) {
  const [recorded, setRecorded] = useState<Recorded | null>(null);
  const asking = missions.filter((m) => m.state === "needs_you" || m.state === "blocked");
  const due = followUps.filter(
    (f) => !findWait(waits, { leadId: f.target.leadId, contactId: f.target.contactId, personId: f.target.personId }),
  );
  const reachable = people.filter(
    (p) => !findWait(waits, { personId: p.contactId, contactId: p.contactId }),
  );

  if (asking.length === 0 && reachable.length === 0 && due.length === 0 && !recorded) {
    return null;
  }

  return (
    <div className="space-y-2.5">
      {recorded && (
        <RecordedLine key={recorded.actionId} recorded={recorded} onClear={() => setRecorded(null)} />
      )}

      {asking.length > 0 && (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {asking.map((m) => (
            <li key={m.id}>
              <Link
                href={`/missions/${m.id}`}
                className="flex items-start gap-3 px-4 py-3 transition hover:bg-slate-50"
              >
                <StateGlyph state={m.state} className="mt-1" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-900">
                    <KindChip kind={m.state === "needs_you" ? "Decide" : "Stopped"} />
                    <MissionMark emoji={m.emoji} size="sm" />
                    {m.title}
                  </span>
                  <span
                    className={`mt-0.5 block text-[13px] leading-snug ${
                      m.state === "needs_you" ? "text-amber-900" : "text-rose-700"
                    }`}
                  >
                    {m.state === "needs_you" ? "Asks: " : "Stopped: "}
                    {m.reason}
                  </span>
                </span>
                <span className="shrink-0 pt-0.5 text-[12px] font-medium text-sky-700">
                  {m.state === "needs_you" ? "Answer" : "Open"} →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Above the strangers: someone who already heard from us is worth more
          than someone who never has. Follow-ups are Bob's to chase; this list
          is the exception rail, not a place to report Sent-a-follow-up. */}
      {due.length > 0 && (
        <div>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {groupByPerson(due).map((group) =>
              group.length === 1 ? (
                <FollowUpRow key={group[0].actionId} item={group[0]} onRecorded={setRecorded} waits={waits} />
              ) : (
                <FollowUpGroup
                  key={group[0].actionId}
                  items={group}
                  onRecorded={setRecorded}
                  waits={waits}
                />
              ),
            )}
          </ul>
          {moreFollowUps > 0 && (
            <p className="mt-1.5 px-1 text-[11.5px] text-slate-500">
              {moreFollowUps} more {moreFollowUps === 1 ? "follow-up is" : "follow-ups are"} due —
              they appear here as these are handed to Bob or dismissed.
            </p>
          )}
        </div>
      )}

      {reachable.length > 0 && (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {reachable.map((p) => (
            <ReadyPerson key={p.contactId} person={p} onRecorded={setRecorded} waits={waits} />
          ))}
        </ul>
      )}
    </div>
  );
}

const FOLLOW_UP_LABEL: Partial<Record<ContactOutcome, string>> = {
  sent: "Sent a follow-up",
};

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * Follow-ups for the same person, together.
 *
 * A recruiter who sent four roles got four replies, and Today showed the same
 * name four times with four mail buttons for one mailbox. Grouped by the
 * address the follow-up would go to (or, without one, the name and company),
 * in the order Today already sorts them: most overdue first.
 */
function groupByPerson(items: FollowUp[]): FollowUp[][] {
  const groups = new Map<string, FollowUp[]>();
  for (const item of items) {
    const key =
      (item.value ?? "").trim().toLowerCase() ||
      `${item.who}|${item.company ?? ""}`.toLowerCase();
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return Array.from(groups.values());
}

/** One card per person: who, where, one channel button, then a line per role. */
function FollowUpGroup({
  items,
  onRecorded,
  waits,
}: {
  items: FollowUp[];
  onRecorded: (r: Recorded) => void;
  waits: InProgressWait[];
}) {
  const first = items[0];
  const mostOverdue = Math.max(...items.map((i) => i.daysOverdue));
  const overdue = mostOverdue > 0;
  const isPhone = first.channelKind === "phone";
  const isEmail = first.channelKind === "email";

  return (
    <li className="flex">
      <span aria-hidden className={`w-[3px] shrink-0 ${overdue ? "bg-amber-500" : "bg-sky-500"}`} />
      <div className="min-w-0 grow">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-1 pt-2.5">
          <div className="min-w-0 grow basis-72">
            <p className="flex flex-wrap items-center gap-x-2 text-[13.5px]">
              <KindChip kind="Follow up" />
              <span className="font-semibold tracking-[-0.01em] text-slate-900">{first.who}</span>
              {first.company && first.company !== first.who ? (
                <span className="text-slate-700">· {first.company}</span>
              ) : null}
              <span className="text-slate-500">— {items.length} roles to follow up</span>
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px]">
              <Clock className={`h-3 w-3 ${overdue ? "text-amber-600" : "text-sky-600"}`} />
              <span className={overdue ? "font-medium text-amber-800" : "text-slate-500"}>
                {overdue
                  ? `oldest follow-up ${mostOverdue === 1 ? "a day" : `${mostOverdue} days`} overdue`
                  : "follow-ups due today"}
              </span>
              {first.value && <span className="font-mono text-slate-500">{first.value}</span>}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            {first.value && isPhone ? (
              <a
                href={telHref(first.value)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-slate-800"
              >
                <Phone className="h-3 w-3" />
                Dial
              </a>
            ) : first.value && isEmail ? (
              <a
                href={mailtoHref(first.value)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-slate-800"
              >
                <Mail className="h-3 w-3" />
                Open mail
              </a>
            ) : null}
          </div>
        </div>
        <ul className="divide-y divide-slate-100">
          {items.map((item) => (
            <FollowUpRow
              key={item.actionId}
              item={item}
              onRecorded={onRecorded}
              waits={waits}
              compact
            />
          ))}
        </ul>
        {isEmail && (
          <p className="px-4 pb-2.5 pt-1 text-[11px] text-slate-500">{EMAIL_CARD_NOTE}</p>
        )}
      </div>
    </li>
  );
}

/**
 * A follow-up due. Email cards hand the chase to Bob; phone stays a human
 * call until the mailbox covers voice.
 */
function FollowUpRow({
  item,
  onRecorded,
  waits,
  compact = false,
}: {
  item: FollowUp;
  onRecorded: (r: Recorded) => void;
  waits: InProgressWait[];
  /** One role inside a person's card: the person, address and mail button live on the card. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<ContactOutcome | "later" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSent, setShowSent] = useState(false);
  const outcomes = outcomesFor(item.channelKind);
  const isPhone = item.channelKind === "phone";
  const isEmail = item.channelKind === "email";
  const overdue = item.daysOverdue > 0;
  const who = [item.who, item.company].filter(Boolean).join(" · ");

  async function log(outcome: ContactOutcome) {
    setBusy(outcome);
    setError(null);
    try {
      const res = await fetch("/api/outreach/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...item.target,
          channelKind: item.channelKind,
          value: item.value ?? (isPhone ? "the number on record" : "the address on record"),
          outcome,
          subject: outcome === "sent" && item.subject ? `Re: ${item.subject.replace(/^re:\s*/i, "")}` : undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; actionId?: string };
      if (!res.ok || !body.actionId) {
        setError(body.error ?? "Could not record that.");
        return;
      }
      onRecorded({
        actionId: body.actionId,
        sentence: FOLLOW_UP_LABEL[outcome] ?? outcomeSentence(outcome, item.channelKind),
        who,
      });
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(null);
    }
  }

  async function later() {
    setBusy("later");
    setError(null);
    try {
      const res = await fetch("/api/outreach/log", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: item.actionId, later: true }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not move it.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(null);
    }
  }

  const verb = item.lookAgain
    ? "Look again"
    : isPhone
      ? item.outcome === "no_answer"
        ? "Called, no answer"
        : "Called"
      : item.channelKind === "linkedin"
        ? "Messaged"
        : "Emailed";

  // Two lines, not four: eight of these sat above the people still to reach
  // and pushed them a screen down.
  return (
    <li className={compact ? "flex pl-4" : "flex"}>
      {!compact && (
        <span aria-hidden className={`w-[3px] shrink-0 ${overdue ? "bg-amber-500" : "bg-sky-500"}`} />
      )}
      <div className={`min-w-0 grow px-4 ${compact ? "py-2" : "py-2.5"}`}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-0 grow basis-72">
            {compact ? (
              <p className="text-[13px] font-medium text-slate-800">
                {item.about ?? item.subject ?? "Follow-up"}
              </p>
            ) : (
              <p className="flex flex-wrap items-center gap-x-2 text-[13.5px]">
                <KindChip kind="Follow up" />
                <span className="font-semibold tracking-[-0.01em] text-slate-900">{item.who}</span>
                {item.company && item.company !== item.who ? (
                  <span className="text-slate-700">· {item.company}</span>
                ) : null}
                {item.about ? <span className="text-slate-500">— {item.about}</span> : null}
              </p>
            )}
            <p
              className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px]"
              suppressHydrationWarning
            >
              {!compact && (
                <Clock className={`h-3 w-3 ${overdue ? "text-amber-600" : "text-sky-600"}`} />
              )}
              <span className="text-slate-600">
                {verb} {shortDate(item.at)}
              </span>
              <span className={overdue ? "font-medium text-amber-800" : "text-slate-500"}>
                {overdue
                  ? `follow-up ${item.daysOverdue === 1 ? "a day" : `${item.daysOverdue} days`} overdue`
                  : "follow-up due today"}
              </span>
              {item.value && !compact && <span className="font-mono text-slate-500">{item.value}</span>}
              {item.sent && !item.lookAgain && (
                <button
                  type="button"
                  onClick={() => setShowSent((v) => !v)}
                  aria-expanded={showSent}
                  className="font-medium text-sky-700 transition hover:text-sky-900"
                >
                  {showSent ? "Hide what went out" : "What went out"}
                </button>
              )}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            {compact ? null : item.value && isPhone ? (
              <a
                href={telHref(item.value)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-slate-800"
              >
                <Phone className="h-3 w-3" />
                Dial
              </a>
            ) : item.value && isEmail ? (
              <a
                href={mailtoHref(
                  item.value,
                  item.subject ? `Re: ${item.subject.replace(/^re:\s*/i, "")}` : null,
                )}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-slate-800"
              >
                <Mail className="h-3 w-3" />
                Open mail
              </a>
            ) : item.value && item.channelKind === "linkedin" ? (
              <a
                href={item.value}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-slate-800"
              >
                Open profile
                <ArrowUpRight className="h-3 w-3" />
              </a>
            ) : null}
            {!isEmail && (
              <>
                <button
                  type="button"
                  onClick={() => void later()}
                  disabled={busy !== null}
                  title="Look at this again in four days. Nothing is recorded as done."
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
                >
                  {busy === "later" && <Loader2 className="h-3 w-3 animate-spin" />}
                  Later
                </button>
                <div className="flex overflow-hidden rounded-lg border border-slate-200">
                  {outcomes.map(({ outcome, label }, i) => (
                    <button
                      key={outcome}
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void log(outcome)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 ${
                        i > 0 ? "border-l border-slate-200" : ""
                      }`}
                    >
                      {busy === outcome && <Loader2 className="h-3 w-3 animate-spin" />}
                      {FOLLOW_UP_LABEL[outcome] ?? label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        {isEmail && (
          <div className="mt-2">
            <EmailCardActions
              target={{
                who,
                about: item.about,
                leadId: item.target.leadId,
                contactId: item.target.contactId,
                personId: item.target.personId,
                actionId: item.actionId,
                channelKind: item.channelKind,
                value: item.value ?? "the address on record",
                subject: item.subject,
                words: item.sent,
                draft: item.sent,
              }}
              onRecorded={onRecorded}
              hideNote={compact}
              alreadyWith={findWait(waits, {
                leadId: item.target.leadId,
                contactId: item.target.contactId,
                personId: item.target.personId,
              })}
            />
          </div>
        )}
        {showSent && item.sent && (
          <pre className="mt-2 max-w-3xl whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 font-mono text-[12px] leading-[1.7] text-slate-700">
            {item.subject ? `${item.subject}\n\n` : ""}
            {item.sent}
          </pre>
        )}
        {error && <p className="mt-2 text-[12px] text-rose-600">{error}</p>}
      </div>
    </li>
  );
}

function ReadyPerson({
  person,
  onRecorded,
  waits,
}: {
  person: ReadyToContact;
  onRecorded: (r: Recorded) => void;
  waits: InProgressWait[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<ContactOutcome | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { channel } = person;
  const outcomes = outcomesFor(channel.kind);
  // Written words can be changed before they go; a call opener is only read.
  const written = channel.kind !== "phone";
  const [editing, setEditing] = useState(false);
  const [words, setWords] = useState(person.words ?? "");
  const outgoing = written ? words : (person.words ?? "");
  const Icon =
    channel.kind === "phone"
      ? Phone
      : channel.kind === "email"
        ? Mail
        : channel.kind === "linkedin"
          ? UserRound
          : Link2;
  const shown =
    channel.kind === "linkedin"
      ? "LinkedIn profile"
      : channel.kind === "contact_form"
        ? hostOf(channel.value)
        : channel.value;

  async function log(outcome: ContactOutcome) {
    setBusy(outcome);
    setError(null);
    try {
      const res = await fetch("/api/outreach/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId: person.contactId,
          channelKind: channel.kind,
          value: channel.value,
          outcome,
          content: outgoing.trim() || undefined,
          draft: person.words ?? undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; actionId?: string };
      if (!res.ok || !body.actionId) {
        setError(body.error ?? "Could not record that.");
        return;
      }
      onRecorded({
        actionId: body.actionId,
        sentence: outcomeSentence(outcome, channel.kind),
        who: [person.name, person.companyName].filter(Boolean).join(" · "),
      });
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="flex">
      <span aria-hidden className="w-[3px] shrink-0 bg-emerald-500" />
      <div className="min-w-0 grow px-4 py-3.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <KindChip kind={channel.kind === "phone" ? "Call" : "Write"} />
          <p className="text-[14px] font-semibold tracking-[-0.01em] text-slate-900">{person.name}</p>
          {person.title ? <p className="text-[13px] text-slate-500">{person.title}</p> : null}
          {person.companyName ? <p className="text-[13px] text-slate-700">· {person.companyName}</p> : null}
          {!person.verified && (
            <span
              title="Found by an employee from a public source. Nobody has confirmed it yet."
              className="rounded-md bg-sky-50 px-1.5 py-px text-[10.5px] font-medium text-sky-700 ring-1 ring-inset ring-sky-200"
            >
              Agent-found
            </span>
          )}
          <span className="grow" />
          <Link
            href={`/missions/${person.mission.id}`}
            className="inline-flex items-center gap-1 text-[11.5px] text-slate-500 transition hover:text-slate-900"
          >
            from
            <MissionMark emoji={person.mission.emoji} size="sm" />
            {person.mission.title} →
          </Link>
        </div>

        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
          <Icon className={`h-3.5 w-3.5 ${channel.kind === "phone" ? "text-emerald-600" : "text-sky-600"}`} />
          <span className="font-mono text-slate-900">{shown}</span>
          <span className="text-slate-500">{WHOSE[channel.whose]}</span>
          {person.sourceUrl && (
            <a
              href={person.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 text-slate-400 transition hover:text-slate-700"
            >
              source
              <ArrowUpRight className="h-3 w-3" />
            </a>
          )}
        </p>

        {person.words &&
          (written && (editing || words !== person.words) ? (
            <div className="mt-2 max-w-3xl">
              <EditableWords
                value={words}
                original={person.words}
                onChange={setWords}
                label={`The words to send ${person.name}`}
              />
            </div>
          ) : (
            <div className="mt-2 max-w-3xl">
              <p className="line-clamp-2 font-mono text-[12px] leading-relaxed text-slate-600">
                {person.words}
              </p>
              {written && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="mt-0.5 text-[11.5px] font-medium text-sky-700 transition hover:text-sky-900"
                >
                  Edit before sending
                </button>
              )}
            </div>
          ))}

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {channel.kind === "phone" ? (
            <a
              href={telHref(channel.value)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-slate-800"
            >
              <Phone className="h-3 w-3" />
              Dial
            </a>
          ) : channel.kind === "email" ? (
            <a
              href={mailtoHref(channel.value, null, outgoing)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-slate-800"
            >
              <Mail className="h-3 w-3" />
              Open mail
            </a>
          ) : (
            <a
              href={channel.value}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-slate-800"
            >
              {channel.kind === "linkedin" ? "Open profile" : "Open the form"}
              <ArrowUpRight className="h-3 w-3" />
            </a>
          )}
          {person.words && (
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(outgoing);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1800);
                } catch {
                  setError("Could not reach the clipboard.");
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-medium text-slate-700 transition hover:bg-slate-50"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy the words"}
            </button>
          )}
          {channel.kind !== "email" && (
            <>
              <span className="grow" />
              <div className="flex overflow-hidden rounded-lg border border-slate-200">
                {outcomes.map(({ outcome, label }, i) => (
                  <button
                    key={outcome}
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void log(outcome)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 ${
                      i > 0 ? "border-l border-slate-200" : ""
                    }`}
                  >
                    {busy === outcome && <Loader2 className="h-3 w-3 animate-spin" />}
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        {channel.kind === "email" && (
          <div className="mt-2">
            <EmailCardActions
              target={{
                who: [person.name, person.companyName].filter(Boolean).join(" · "),
                about: person.title,
                personId: person.contactId,
                missionId: person.mission.id,
                companyId: person.companyId ?? undefined,
                channelKind: channel.kind,
                value: channel.value,
                words: outgoing,
                draft: person.words,
              }}
              onRecorded={onRecorded}
              alreadyWith={findWait(waits, {
                personId: person.contactId,
                contactId: person.contactId,
              })}
            />
          </div>
        )}
        {channel.kind !== "phone" && channel.kind !== "email" && (
          <p className="mt-1.5 text-[11px] text-slate-500">
            Opening mail sends nothing — press Sent once it has actually gone.
          </p>
        )}
        {error && <p className="mt-2 text-[12px] text-rose-600">{error}</p>}
      </div>
    </li>
  );
}

function RecordedLine({ recorded, onClear }: { recorded: Recorded; onClear: () => void }) {
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
        body: JSON.stringify({ actionId: recorded.actionId }),
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
        <span>Undone — {recorded.who} is back on the list.</span>
      ) : (
        <span className="flex items-start gap-1.5">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <span>
            <span className="font-semibold">Recorded: {recorded.sentence}</span> — {recorded.who}.
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
          {state === "undoing" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
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

/**
 * Quiet In progress: Bob / Scout / Hanna still working. Needs you stays for
 * human decisions only. Take back lives in the thread, next to what the
 * employee has done so far, so nobody takes work back without reading it.
 */
export function InProgressWaits({
  waits,
  embedded = false,
}: {
  waits: InProgressWait[];
  /** Inside an employee's group: no frame of its own and no empty message. */
  embedded?: boolean;
}) {
  const handoff = useTodayHandoff();

  if (waits.length === 0) {
    return embedded ? null : (
      <p className="rounded-2xl border border-dashed border-slate-300 px-5 py-6 text-center text-[13px] text-slate-500">
        Nothing with the team right now. Hand a card to Bob and it waits here.
      </p>
    );
  }

  return (
    <div>
      <ul
        className={
          embedded
            ? "divide-y divide-slate-100 border-t border-slate-100 bg-slate-50/40"
            : "divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white"
        }
      >
        {waits.map((wait) => (
          <li key={wait.assignmentId} className="flex items-start gap-3 px-4 py-3">
            <span className="mt-0.5 text-[16px]" aria-hidden>
              {wait.agentEmoji}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-slate-900">{wait.title}</p>
              <p className="mt-0.5 text-[12px] text-slate-500">
                {wait.withLabel}
                {wait.status === "active" ? " · working" : " · queued"}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  handoff?.openThread({
                    assignmentId: wait.assignmentId,
                    title: wait.title,
                    agentName: wait.agentName,
                    messageCount: wait.messageCount,
                    awaitingAgent: wait.awaitingAgent,
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-slate-800"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Open thread
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * In progress, one quiet line per employee.
 *
 * Ten rows of "With Bob · working", each with two buttons, made the work that
 * needs nothing from you as loud as the work that does. The line says who is
 * busy with what; the rows, Open thread and Take back are one click away.
 */
export function InProgressByEmployee({ waits }: { waits: InProgressWait[] }) {
  if (waits.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-300 px-5 py-6 text-center text-[13px] text-slate-500">
        Nothing with the team right now. Hand a card to Bob and it waits here.
      </p>
    );
  }

  const groups: Array<{ name: string; emoji: string; waits: InProgressWait[] }> = [];
  for (const wait of waits) {
    const group = groups.find((g) => g.name === wait.agentName);
    if (group) group.waits.push(wait);
    else groups.push({ name: wait.agentName, emoji: wait.agentEmoji, waits: [wait] });
  }

  return (
    <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {groups.map((group) => (
        <EmployeeWaits key={group.name} {...group} />
      ))}
    </div>
  );
}

function EmployeeWaits({
  name,
  emoji,
  waits,
}: {
  name: string;
  emoji: string;
  waits: InProgressWait[];
}) {
  const [open, setOpen] = useState(false);
  const working = waits.filter((w) => w.status === "active").length;
  const queued = waits.length - working;
  const replies = waits.reduce((n, w) => n + (w.awaitingAgent > 0 ? 1 : 0), 0);
  const preview = waits
    .slice(0, 3)
    .map((w) => w.title)
    .join(" · ");

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500/40"
      >
        <span className="mt-0.5 text-[16px]" aria-hidden>
          {emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold text-slate-900">
            {name}
            <span className="font-normal text-slate-500">
              {" — "}
              {working > 0 ? `${working} working` : null}
              {working > 0 && queued > 0 ? ", " : null}
              {queued > 0 ? `${queued} queued` : null}
              {replies > 0 ? ` · ${replies} with a message for ${name}` : null}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-[12px] text-slate-500">
            {preview}
            {waits.length > 3 ? ` · and ${waits.length - 3} more` : ""}
          </span>
        </span>
        <span className="shrink-0 pt-0.5 text-[12px] font-medium text-sky-700">
          {open ? "Hide" : "Show"}
        </span>
      </button>
      {open && <InProgressWaits waits={waits} embedded />}
    </div>
  );
}

/**
 * Done since you looked.
 *
 * A mission that finished since you last opened it, and work outside missions
 * finished in the last day. Opening the mission or the thread is where the
 * result lives; a mission leaves this list once you have opened it.
 */
export function DoneSince({
  missions,
  done,
  children,
}: {
  /** Missions whose latest step finished after you last opened them. */
  missions: MissionTab[];
  /** Missionless work finished in the last day. */
  done: DoneItem[];
  /** Older reports, folded, when there are any. */
  children?: React.ReactNode;
}) {
  const handoff = useTodayHandoff();

  if (missions.length === 0 && done.length === 0) {
    return (
      <div className="space-y-2.5">
        <p className="rounded-2xl border border-dashed border-slate-300 px-5 py-5 text-center text-[13px] text-slate-500">
          Nothing new has come back since you looked.
        </p>
        {children}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {missions.map((m) => (
          <li key={m.id}>
            <Link
              href={`/missions/${m.id}`}
              className="flex items-start gap-3 px-4 py-3 transition hover:bg-slate-50"
            >
              <span className="mt-0.5">
                <MissionMark emoji={m.emoji} size="sm" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold text-slate-900">{m.title}</span>
                <span className="mt-0.5 block text-[12px] text-slate-500" suppressHydrationWarning>
                  Mission finished a step · {ago(m.updatedAt)}
                </span>
              </span>
              <span className="shrink-0 pt-0.5 text-[12px] font-medium text-sky-700">Open →</span>
            </Link>
          </li>
        ))}
        {done.map((item) => (
          <li key={item.assignmentId} className="flex items-start gap-3 px-4 py-3">
            <span className="mt-0.5 text-[16px]" aria-hidden>
              {item.agentEmoji}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold text-slate-900">{item.title}</span>
              <span className="mt-0.5 block text-[12px] text-slate-500" suppressHydrationWarning>
                {item.agentName} finished · {ago(item.completedAt)}
              </span>
            </span>
            <button
              type="button"
              onClick={() =>
                handoff?.openThread({
                  assignmentId: item.assignmentId,
                  title: item.title,
                  agentName: item.agentName,
                  messageCount: item.messageCount,
                  awaitingAgent: item.awaitingAgent,
                  finished: true,
                })
              }
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Open thread
            </button>
          </li>
        ))}
      </ul>
      {children}
    </div>
  );
}
