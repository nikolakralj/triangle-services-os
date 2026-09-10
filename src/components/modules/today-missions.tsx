"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Check,
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
import {
  outcomeSentence,
  outcomesFor,
  telHref,
  type ContactOutcome,
} from "@/lib/data/contact-channels";
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
}: {
  people: ReadyToContact[];
  missions: MissionTab[];
}) {
  const [recorded, setRecorded] = useState<Recorded | null>(null);
  const asking = missions.filter((m) => m.state === "needs_you" || m.state === "blocked");

  if (asking.length === 0 && people.length === 0 && !recorded) {
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
          content: person.words ?? undefined,
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

        {person.words && (
          <p className="mt-2 line-clamp-2 max-w-3xl font-mono text-[12px] leading-relaxed text-slate-600">
            {person.words}
          </p>
        )}

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
              href={`mailto:${channel.value}${person.words ? `?body=${encodeURIComponent(person.words)}` : ""}`}
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
                  await navigator.clipboard.writeText(person.words ?? "");
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
