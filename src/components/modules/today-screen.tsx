"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  Copy,
  Loader2,
  Mail,
  Phone,
  Send,
  Trash2,
} from "lucide-react";
import type { NextMove, NextMoveAction } from "@/lib/data/next-move";
import type { CameBackItem } from "@/lib/data/came-back";
import { telHref } from "@/lib/data/contact-channels";
import { AgentReport } from "@/components/modules/agent-report";

// ---------------------------------------------------------------------------
// One screen. Three zones. Numbered because it is a real order, not decoration.
//
//   01  NOW              exactly one card — the single highest-leverage action
//   02  ASK              type it, it runs, the answer appears underneath
//   03  BACK FROM THE TEAM   every item is a decision, not a report
//
// Replaces the Operations Cockpit, the Workforce hand-out list, "What you
// handed out", the Agent Desk and its four tabs. All of those showed the same
// event in four vocabularies and offered, at the end, a "Done" button wired to
// `setDrawerItem(null)`.
//
// "So I am handing out in Workforce and then I see details in Cockpit and also
// Workforce ... it is so confusing." Chasing one lead took eight steps across
// three pages and recorded nothing. Here it takes one.
// ---------------------------------------------------------------------------

interface Employee {
  id: string;
  name: string;
  emoji: string;
  roleTitle: string | null;
}

export function TodayScreen({
  move,
  employees,
  cameBack,
  counts,
}: {
  move: NextMove;
  employees: Employee[];
  cameBack: CameBackItem[];
  counts: { projects: number; companies: number; leads: number; people: number };
}) {
  return (
    <div className="space-y-5">
      <Zone n="01" name="Now" note="one card — the rest can wait">
        <NowCard move={move} />
      </Zone>

      <Zone n="02" name="Ask" note="runs immediately, answers here">
        <AskBox employees={employees} />
      </Zone>

      <Zone
        n="03"
        name="Back from the team"
        note={noteFor(cameBack)}
      >
        <CameBackList items={cameBack} />
      </Zone>

      <p className="px-1 text-xs text-slate-400">
        On file: {counts.people} people · {counts.projects} projects ·{" "}
        {counts.companies} companies · {counts.leads} inbound requisitions.
      </p>
    </div>
  );
}

/** How many of these actually need an answer, as opposed to sitting in history. */
function noteFor(items: CameBackItem[]): string {
  const decisions = items.filter((i) => i.state !== null).length;
  if (items.length === 0) return "nothing waiting";
  if (decisions === 0) return "nothing to decide";
  return `${decisions} to decide`;
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
      <div className="mb-1.5 flex items-baseline gap-2 px-1">
        <span className="font-mono text-[11px] font-semibold tracking-widest text-sky-700">
          {n}
        </span>
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
          {name}
        </h2>
        <span className="text-xs text-slate-400">— {note}</span>
      </div>
      {children}
    </section>
  );
}

// ── 01 · NOW ────────────────────────────────────────────────────────────────

function NowCard({ move }: { move: NextMove }) {
  if (move.clear || !move.action) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-sm font-semibold text-slate-900">{move.headline}</p>
        <p className="mt-1 text-sm text-slate-600">{move.because}</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-slate-950 p-5 text-slate-100">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
        Highest commercial leverage
      </p>
      <h3 className="mt-2 text-lg font-semibold leading-snug text-white">
        {move.headline}
      </h3>
      <p className="mt-1 text-sm text-slate-400">{move.because}</p>
      <ActionPanel action={move.action} />
    </div>
  );
}

/**
 * Dial, copy, then log what happened.
 *
 * Carried over unchanged from the cockpit: the one part of that screen that
 * did the right thing. The CEO's maximum effort is a copied email or picking
 * up the phone, and the three outcome buttons are the whole of the contact
 * history — no stages, no scores, no forms.
 */
function ActionPanel({ action }: { action: NextMoveAction }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [logging, setLogging] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isPhone = action.channelKind === "phone";

  async function log(outcome: "reached" | "no_answer" | "dead_end") {
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
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not log that.");
        return;
      }
      setNote("");
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setLogging(null);
    }
  }

  return (
    <div className="mt-4 space-y-3 border-t border-slate-800 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-slate-300">{action.value}</span>
        <span className="text-[11px] text-slate-500">{action.whose}</span>
        <span className="grow" />
        {isPhone ? (
          <a
            href={telHref(action.value)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
          >
            <Phone className="h-3 w-3" />
            Dial
          </a>
        ) : (
          <a
            href={`mailto:${action.value}${
              action.subject ? `?subject=${encodeURIComponent(action.subject)}` : ""
            }${action.script ? `&body=${encodeURIComponent(action.script)}` : ""}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
          >
            <Mail className="h-3 w-3" />
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
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
          >
            {copied ? (
              <Check className="h-3 w-3 text-emerald-400" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            {copied ? "Copied" : "Copy pitch"}
          </button>
        )}
      </div>

      {action.offering && (
        <div className="rounded-lg border border-sky-900 bg-sky-950/50 p-3">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-sky-300">
            Who we put forward
          </p>
          <p className="mt-0.5 text-sm font-semibold text-white">
            {action.offering.name}
            {action.offering.role ? ` · ${action.offering.role}` : ""}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-300">
            {action.offering.why}
          </p>
          {action.offering.caveats.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {action.offering.caveats.map((c) => (
                <span
                  key={c}
                  className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300"
                >
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {action.script && (
        <div className="whitespace-pre-line rounded-lg bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-300">
          {action.script}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
          Then
        </span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What happened? (optional)"
          className="h-7 min-w-0 grow rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-200 placeholder-slate-600 focus:border-slate-500 focus:outline-none"
        />
        {(
          [
            ["reached", "Got through", "bg-emerald-900/60 border-emerald-700 text-emerald-200"],
            ["no_answer", "No answer", "bg-slate-800 border-slate-600 text-slate-200"],
            ["dead_end", "Dead end", "bg-rose-950/60 border-rose-800 text-rose-200"],
          ] as const
        ).map(([outcome, label, cls]) => (
          <button
            key={outcome}
            type="button"
            disabled={logging !== null}
            onClick={() => log(outcome)}
            className={`inline-flex items-center gap-1 rounded border px-2.5 py-1 text-xs font-semibold disabled:opacity-40 ${cls}`}
          >
            {logging === outcome && <Loader2 className="h-3 w-3 animate-spin" />}
            {label}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
      {action.history.length > 0 && (
        <p className="text-[11px] text-slate-500">
          {action.history.length}{" "}
          {action.history.length === 1 ? "attempt" : "attempts"} already recorded —
          last was{" "}
          {/* A null outcome means nobody wrote down how it went. That is not
              the same as any of the three outcomes, so it is not dressed up
              as one. */}
          {action.history[0].outcome
            ? action.history[0].outcome.replace("_", " ")
            : "not written down"}
          .
        </p>
      )}
    </div>
  );
}

// ── 02 · ASK ────────────────────────────────────────────────────────────────

/**
 * One box. No employee to choose.
 *
 * The old dispatch bar made the CEO pick Scout or Hanna from a dropdown before
 * typing, which is asking him to know the org chart to ask a question. The
 * brief itself says which of them it is: anything about our own people is
 * Hanna's, anything about the market is Scout's.
 */
function AskBox({ employees }: { employees: Employee[] }) {
  const router = useRouter();
  const [brief, setBrief] = useState("");
  const [stage, setStage] = useState<"idle" | "sending" | "working">("idle");
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scout = employees.find((e) => /scout/i.test(e.name)) ?? employees[0];
  const hanna = employees.find((e) => /hanna/i.test(e.name)) ?? scout;

  /** Whose question is this? Our own people, or the market. */
  function route(text: string): Employee {
    const ours =
      /\b(our|we have|bench|roster|pool|worker|crew|cv|available|visa|passport|certificate|supervisor|engineer)\b/i.test(
        text,
      );
    const market = /\b(find|contractor|epc|tender|project|buyer|company|market)\b/i.test(
      text,
    );
    return ours && !market ? hanna : scout;
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const text = brief.trim();
    if (text.length < 8 || stage !== "idle") return;
    const who = route(text);
    setError(null);
    setAnswer(null);
    setStage("sending");
    try {
      const created = await fetch("/api/agents/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentInstanceId: who.id,
          title: text.split("\n")[0].slice(0, 120),
          objective: text,
          priority: "high",
          constraints: { execution_mode: "in_app", case_type: "open_research" },
        }),
      });
      const createdBody = (await created.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!created.ok) {
        setError(createdBody.error ?? "Could not hand that out.");
        setStage("idle");
        return;
      }

      setStage("working");
      const ran = await fetch("/api/agents/run-now", { method: "POST" });
      const ranBody = (await ran.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };
      setAnswer(
        ran.ok
          ? (ranBody.message ?? "Done — it is in Back from the team below.")
          : `Queued, but it could not run now: ${ranBody.error ?? "unknown reason"}.`,
      );
      setBrief("");
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setStage("idle");
    }
  }

  const who = brief.trim().length >= 8 ? route(brief) : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <form onSubmit={ask} className="flex flex-wrap items-center gap-2">
        <input
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="Find HVAC and EPC contractors in Frankfurt needing subcontractors"
          className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={stage !== "idle" || brief.trim().length < 8}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {stage === "idle" ? (
            <Send className="h-4 w-4" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin" />
          )}
          {stage === "working" ? "Working…" : "Ask"}
        </button>
      </form>
      <p className="mt-1.5 text-xs text-slate-500">
        {stage === "working"
          ? "Running it now — about a minute. The answer lands below."
          : who
            ? `Goes to ${who.emoji} ${who.name}.`
            : "Runs immediately. Nothing is sent to anyone."}
      </p>
      {answer && <p className="mt-2 text-sm text-slate-800">{answer}</p>}
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
    </div>
  );
}

// ── 03 · BACK FROM THE TEAM ─────────────────────────────────────────────────

const STATE_LABEL: Record<string, string> = {
  reachable: "Reachable",
  one_thing_missing: "One thing missing",
  dead: "Dead",
};

const STATE_CLASS: Record<string, string> = {
  reachable: "bg-emerald-50 text-emerald-700",
  one_thing_missing: "bg-amber-50 text-amber-800",
  dead: "bg-rose-50 text-rose-700",
};

function CameBackList({ items }: { items: CameBackItem[] }) {
  // Items filed before the contract carry no state, so they are not decisions
  // — there is nothing for them to be a decision ABOUT. Thirty-one of them in
  // one list is the wall this screen exists to replace, and putting them above
  // the two or three things that genuinely need answering would recreate the
  // old Agent Desk with better fonts. They stay reachable, one click away.
  const decisions = items.filter((i) => i.state !== null);
  const legacy = items.filter((i) => i.state === null);

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
        Nothing waiting. Ask for something above and it appears here.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {decisions.length > 0 ? (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {decisions.map((item) => (
            <CameBackRow key={item.key} item={item} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          Nothing needs a decision. Everything below was filed before findings
          had to say what they were.
        </div>
      )}

      {legacy.length > 0 && (
        <details className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm text-slate-600 hover:bg-slate-50">
            <span className="font-medium text-slate-800">{legacy.length} older</span>{" "}
            {legacy.length === 1 ? "item" : "items"}, filed before findings had to
            say what they were. Nothing here is a decision.
          </summary>
          <div className="divide-y divide-slate-100 border-t border-slate-100">
            {legacy.map((item) => (
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

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/came-back", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          kind: item.kind,
          id: item.id,
          title: item.title,
          ...extra,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        assignmentId?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "That did not work.");
        return;
      }
      setDone(
        action === "send_back"
          ? "Handed out — the answer will land here."
          : "Recorded. It will not come back.",
      );
      setDiscarding(false);
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {item.authorEmoji} {item.authorName}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${
            item.state
              ? STATE_CLASS[item.state]
              : "bg-slate-100 text-slate-500"
          }`}
        >
          {item.state
            ? STATE_LABEL[item.state]
            : /* Filed before the contract existed. Said plainly rather than
                 dressed up as a verdict nobody actually reached. */
              "Before the contract"}
        </span>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-slate-700">{item.line}</p>

      {item.state === "one_thing_missing" && item.missing && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span className="font-semibold">Missing:</span> {item.missing.fact}
          <span className="ml-1.5 text-amber-700">— {item.missing.owner}</span>
        </p>
      )}

      {item.state === "dead" && item.deadReason && (
        <p className="mt-2 text-xs italic text-slate-500">{item.deadReason}</p>
      )}

      {item.reach && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
          <span className="font-mono text-xs text-slate-800">{item.reach.value}</span>
          {item.reach.howToOpen && (
            <span className="text-xs text-slate-500">— {item.reach.howToOpen}</span>
          )}
        </div>
      )}

      {done ? (
        <p className="mt-3 text-xs font-medium text-emerald-700">{done}</p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {item.state === "reachable" && item.reach && (
            <>
              {item.reach.value.includes("@") ? (
                <a
                  href={`mailto:${item.reach.value}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
                >
                  <Mail className="h-3 w-3" />
                  Open mail
                </a>
              ) : item.reach.kind === "link" ? (
                <a
                  href={item.reach.value}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
                >
                  Open the page
                  <ArrowRight className="h-3 w-3" />
                </a>
              ) : (
                <a
                  href={telHref(item.reach.value)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
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
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Copy className="h-3 w-3" />
                  Copy the words
                </button>
              )}
            </>
          )}

          {item.state === "one_thing_missing" && item.missing && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => act("send_back", { fact: item.missing?.fact })}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
            >
              {busy === "send_back" && <Loader2 className="h-3 w-3 animate-spin" />}
              Send Scout back for it
            </button>
          )}

          {item.state === "dead" && item.kind === "finding" && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => act("file_refusal")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              {busy === "file_refusal" && <Loader2 className="h-3 w-3 animate-spin" />}
              File the refusal
            </button>
          )}

          {item.kind === "finding" && item.state !== "dead" && (
            <button
              type="button"
              onClick={() => setDiscarding((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
            >
              <Trash2 className="h-3 w-3" />
              Discard
            </button>
          )}

          {item.sourceUrl && (
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-slate-500 hover:text-slate-800"
            >
              Source
            </a>
          )}
        </div>
      )}

      {/* A discard needs a reason, or the same lead is back next week — which
          is the exact failure the dead state exists to prevent. */}
      {discarding && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-rose-50 p-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why? Wrong trade, no buyer, wrong country…"
            className="h-8 min-w-0 grow rounded border border-rose-200 bg-white px-2 text-xs text-slate-900 placeholder-rose-300 focus:border-rose-400 focus:outline-none"
          />
          <button
            type="button"
            disabled={busy !== null || reason.trim().length < 3}
            onClick={() => act("discard", { reason: reason.trim() })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-600 disabled:opacity-40"
          >
            {busy === "discard" && <Loader2 className="h-3 w-3 animate-spin" />}
            Discard for good
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}

      {/* The full hand-in, for when the one line is not enough. Progressive
          disclosure rather than a drawer with a Done button. */}
      {item.fullReport && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-sky-700 hover:text-sky-900">
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
  );
}
