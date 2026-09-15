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
  Sparkles,
  Undo2,
  UserRound,
  X,
} from "lucide-react";
import { hostOf, type MissionTab, type ReadyToContact } from "@/lib/data/mission-shared";
import type { FollowUp } from "@/lib/data/follow-ups";
import {
  mailtoHref,
  outcomeSentence,
  outcomesFor,
  telHref,
  type ContactOutcome,
} from "@/lib/data/contact-channels";
import { EditableWords } from "@/components/modules/editable-words";
import { MissionCard } from "@/components/missions/missions-index";
import { MissionMark, StateGlyph } from "@/components/missions/mission-state";
import { openAsk } from "@/components/missions/ask-launcher";

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
}: {
  people: ReadyToContact[];
  missions: MissionTab[];
  /** Sends and unanswered calls whose follow-up date has come. */
  followUps?: FollowUp[];
  /** Due beyond the ones listed. */
  moreFollowUps?: number;
}) {
  const [recorded, setRecorded] = useState<Recorded | null>(null);
  const asking = missions.filter((m) => m.state === "needs_you" || m.state === "blocked");

  if (asking.length === 0 && people.length === 0 && followUps.length === 0 && !recorded) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-300 px-5 py-6 text-center text-[13px] text-slate-500">
        Nothing waiting on you. When a mission makes somebody reachable, they appear here with the
        number and the words.
      </p>
    );
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
          than someone who never has. */}
      {followUps.length > 0 && (
        <div>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {followUps.map((f) => (
              <FollowUpRow key={f.actionId} item={f} onRecorded={setRecorded} />
            ))}
          </ul>
          {moreFollowUps > 0 && (
            <p className="mt-1.5 px-1 text-[11.5px] text-slate-500">
              {moreFollowUps} more {moreFollowUps === 1 ? "follow-up is" : "follow-ups are"} due —
              they appear here as these are answered.
            </p>
          )}
        </div>
      )}

      {people.length > 0 && (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {people.map((p) => (
            <ReadyPerson key={p.contactId} person={p} onRecorded={setRecorded} />
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
 * "Oliver Hall · g2 Recruitment — emailed 10 Sep, follow-up due 14 Sep."
 *
 * The same three words as everywhere else, because what happens next is one
 * of them: they replied, it is not for us, or we wrote again. "Later" moves
 * the date instead of recording something that did not happen.
 */
function FollowUpRow({
  item,
  onRecorded,
}: {
  item: FollowUp;
  onRecorded: (r: Recorded) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<ContactOutcome | "later" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSent, setShowSent] = useState(false);
  const outcomes = outcomesFor(item.channelKind);
  const isPhone = item.channelKind === "phone";
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

  const verb = isPhone
    ? item.outcome === "no_answer"
      ? "Called, no answer"
      : "Called"
    : item.channelKind === "linkedin"
      ? "Messaged"
      : "Emailed";

  // Two lines, not four: eight of these sat above the people still to reach
  // and pushed them a screen down.
  return (
    <li className="flex">
      <span aria-hidden className={`w-[3px] shrink-0 ${overdue ? "bg-amber-500" : "bg-sky-500"}`} />
      <div className="min-w-0 grow px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-0 grow basis-72">
            <p className="flex flex-wrap items-baseline gap-x-2 text-[13.5px]">
              <span className="font-semibold tracking-[-0.01em] text-slate-900">{item.who}</span>
              {item.company && item.company !== item.who ? (
                <span className="text-slate-700">· {item.company}</span>
              ) : null}
              {item.about ? <span className="text-slate-500">— {item.about}</span> : null}
            </p>
            <p
              className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px]"
              suppressHydrationWarning
            >
              <Clock className={`h-3 w-3 ${overdue ? "text-amber-600" : "text-sky-600"}`} />
              <span className="text-slate-600">
                {verb} {shortDate(item.at)}
              </span>
              <span className={overdue ? "font-medium text-amber-800" : "text-slate-500"}>
                {overdue
                  ? `follow-up ${item.daysOverdue === 1 ? "a day" : `${item.daysOverdue} days`} overdue`
                  : "follow-up due today"}
              </span>
              {item.value && <span className="font-mono text-slate-500">{item.value}</span>}
              {item.sent && (
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
            {item.value && isPhone ? (
              <a
                href={telHref(item.value)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-slate-800"
              >
                <Phone className="h-3 w-3" />
                Dial
              </a>
            ) : item.value && item.channelKind === "email" ? (
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
          </div>
        </div>
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
}: {
  person: ReadyToContact;
  onRecorded: (r: Recorded) => void;
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
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
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
        </div>
        {channel.kind !== "phone" && (
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

export function MissionsZone({ missions }: { missions: MissionTab[] }) {
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => openAsk({})}
        className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left transition hover:border-slate-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
      >
        <Sparkles className="h-4 w-4 shrink-0 text-sky-600" />
        <span className="flex-1 text-[15px] text-slate-400">
          Give the team work, or ask about your people…
        </span>
        <kbd
          suppressHydrationWarning
          className="hidden rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-500 sm:inline"
        >
          {mac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>
      {missions.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {missions.map((t) => (
            <MissionCard key={t.id} tab={t} />
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-slate-300 px-5 py-6 text-center text-[13px] text-slate-500">
          No open missions. Anything you give the team becomes one you can keep talking to.
        </p>
      )}
    </div>
  );
}
