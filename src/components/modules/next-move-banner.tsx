"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  Mail,
  Phone,
  Target,
} from "lucide-react";
import { telHref } from "@/lib/data/contact-channels";
import type { NextMove, NextMoveAction } from "@/lib/data/next-move";

// ---------------------------------------------------------------------------
// One move, and the means to make it.
//
// This used to be a sentence and a link to a list. The instruction that
// followed was exact: "my maximum effort should be copy prepared email ...
// pickup my phone". So the card carries the number as a dial link, the
// sentence to say as one copy button, and three buttons for what happened.
//
// The three outcome buttons are the whole tracking system. Not a stage, not a
// pipeline, not a form — a click. Anything that takes longer than a click does
// not get recorded, and an outreach history with holes in it reads as "never
// tried" for people who were tried three times.
// ---------------------------------------------------------------------------

export function NextMoveBanner({ move }: { move: NextMove }) {
  if (move.clear) {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-950">{move.headline}</p>
          <p className="text-xs text-emerald-800">{move.because}</p>
        </div>
        <Link
          href={move.href}
          className="text-xs font-semibold text-emerald-800 underline-offset-2 hover:underline"
        >
          {move.cta}
        </Link>
      </div>
    );
  }

  return (
    <div className="mb-4 overflow-hidden rounded-2xl bg-slate-950 text-white">
      <div className="flex flex-wrap items-start gap-4 px-5 pt-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500/20">
          <Target className="h-5 w-5 text-sky-300" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-300">
            Do this next
          </p>
          <p className="mt-0.5 text-lg font-semibold leading-tight">{move.headline}</p>
          {move.action ? (
            <p className="mt-0.5 text-sm text-slate-400">
              {[move.action.personRole, move.action.company].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-300">
            {move.because}
          </p>
        </div>
        {!move.action && (
          <Link
            href={move.href}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
          >
            {move.cta}
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>

      {move.action ? <ActionPanel action={move.action} /> : <div className="h-4" />}
    </div>
  );
}

function ActionPanel({ action }: { action: NextMoveAction }) {
  const router = useRouter();
  const [copied, setCopied] = useState<string | null>(null);
  const [logging, setLogging] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState<"reached" | "dead_end" | null>(null);
  const [note, setNote] = useState("");

  const isPhone = action.channelKind === "phone";
  const isEmail = action.channelKind === "email";

  async function copy(what: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Could not reach the clipboard. Select the text and copy it.");
    }
  }

  async function log(outcome: "reached" | "no_answer" | "dead_end", note?: string) {
    setLogging(outcome);
    setError(null);
    try {
      const res = await fetch("/api/outreach/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: action.contactId,
          channelKind: action.channelKind,
          value: action.value,
          outcome,
          note: note?.trim() || undefined,
          content: action.script ?? undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not record that.");
        return;
      }
      setAsking(null);
      setNote("");
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setLogging(null);
    }
  }

  return (
    <div className="mt-3 border-t border-white/10 bg-white/[0.03] px-5 py-4">
      {/* The channel itself — one tap to dial, one click to copy an address. */}
      <div className="flex flex-wrap items-center gap-3">
        {isPhone ? (
          <a
            href={telHref(action.value)}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
          >
            <Phone className="h-4 w-4" />
            Call {action.value}
          </a>
        ) : (
          <a
            href={
              isEmail
                ? `mailto:${action.value}${
                    action.subject ? `?subject=${encodeURIComponent(action.subject)}` : ""
                  }`
                : action.value
            }
            target={isEmail ? undefined : "_blank"}
            rel={isEmail ? undefined : "noopener noreferrer"}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
          >
            <Mail className="h-4 w-4" />
            {action.value}
          </a>
        )}

        <button
          type="button"
          onClick={() => void copy("value", action.value)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/10"
        >
          {copied === "value" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied === "value" ? "Copied" : "Copy"}
        </button>

        <span className="text-xs text-slate-400">
          {action.whose || "unknown desk"}
          {action.sourceUrl ? (
            <>
              {" · "}
              <a
                href={action.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sky-300 underline-offset-2 hover:underline"
              >
                where this came from
                <ExternalLink className="h-3 w-3" />
              </a>
            </>
          ) : null}
        </span>
      </div>

      {/* The words. Written by an employee, so nobody has to compose them. */}
      {action.script ? (
        <div className="mt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              {isPhone ? "Say this" : "The message"}
              {action.subject ? ` · ${action.subject}` : ""}
            </p>
            <button
              type="button"
              onClick={() =>
                void copy(
                  "script",
                  action.subject ? `${action.subject}\n\n${action.script}` : action.script!,
                )
              }
              className="inline-flex items-center gap-1.5 rounded-md border border-white/20 px-2.5 py-1 text-xs font-medium text-slate-200 transition hover:bg-white/10"
            >
              {copied === "script" ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied === "script" ? "Copied" : isPhone ? "Copy the words" : "Copy the email"}
            </button>
          </div>
          <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-slate-900/80 px-3 py-2.5 text-sm leading-relaxed text-slate-200">
            {action.script}
          </p>
        </div>
      ) : null}

      {/* What happened. Three buttons, because those are the three outcomes.
          "No answer" needs no explanation and files instantly. The other two
          carry the only information worth keeping — what they actually said —
          so they ask for one line before filing. That asymmetry is the whole
          difference between a record you write and a form you avoid. */}
      {asking ? (
        <form
          className="mt-4 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void log(asking, note);
          }}
        >
          <span className="text-xs font-medium text-slate-400">
            {asking === "reached" ? "What did they say?" : "Why is it a dead end?"}
          </span>
          <input
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              asking === "reached"
                ? "Asked for our capability statement — call back Tuesday"
                : "Wrong person; procurement is handled in Ijmuiden"
            }
            className="h-8 min-w-0 flex-1 rounded-lg border border-white/20 bg-slate-900 px-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-400"
          />
          <button
            type="submit"
            disabled={logging !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-slate-100 disabled:opacity-50"
          >
            {logging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setAsking(null);
              setNote("");
            }}
            className="text-xs text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
          >
            Cancel
          </button>
        </form>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-400">
            Then tell me what happened:
          </span>
          {(
            [
              ["reached", "Got through"],
              ["no_answer", "No answer"],
              ["dead_end", "Dead end"],
            ] as const
          ).map(([outcome, label]) => (
            <button
              key={outcome}
              type="button"
              disabled={logging !== null}
              onClick={() =>
                outcome === "no_answer" ? void log(outcome) : setAsking(outcome)
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10 disabled:opacity-50"
            >
              {logging === outcome ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {label}
            </button>
          ))}
        </div>
      )}

      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}

      <ContactHistory action={action} />
    </div>
  );
}

/**
 * What has already been tried on this person.
 *
 * Three lines at most. The purpose is to answer "have we been here before"
 * before dialling, not to be a record anybody browses.
 */
function ContactHistory({ action }: { action: NextMoveAction }) {
  if (action.history.length === 0) {
    return (
      <p className="mt-3 border-t border-white/10 pt-2.5 text-xs text-slate-500">
        Nothing tried on {action.personName} yet.
      </p>
    );
  }
  return (
    <div className="mt-3 border-t border-white/10 pt-2.5">
      <p className="text-xs text-slate-500">
        {action.history.length} previous attempt
        {action.history.length === 1 ? "" : "s"} on {action.personName}:
      </p>
      <ul className="mt-1 space-y-0.5">
        {action.history.slice(0, 3).map((a) => (
          <li key={a.id} className="text-xs text-slate-400">
            {a.verb} {formatDay(a.at)} — {a.note ?? "no outcome recorded"}
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "at an unknown time";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
