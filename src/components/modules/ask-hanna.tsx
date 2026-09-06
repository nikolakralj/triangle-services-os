"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";

// ---------------------------------------------------------------------------
// One box. You ask; she answers.
//
// No dropdowns, no saved searches, no advanced panel. "Give me 2 best
// electrical supervisors for a steel project in USA" is a better interface
// than any set of filters, and the filters underneath it stay for the times
// you want to browse rather than ask.
//
// The answer is deliberately allowed to be bad news. "Nobody in the pool is a
// supervisor" is worth more than a weak match dressed up as a good one, and
// what nobody has recorded — visas, work authorisation, which country a ticket
// is valid in — is shown as the blocker it actually is.
// ---------------------------------------------------------------------------

interface Person {
  id: string;
  name: string;
  role: string | null;
  status: string;
}

interface Answer {
  answer: string;
  people: Person[];
  blockers: string[];
  missing: string[];
}

export function AskHanna({ poolSize }: { poolSize: number }) {
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (q.length < 3 || asking) return;
    setAsking(true);
    setError(null);
    try {
      const res = await fetch("/api/workers/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = (await res.json().catch(() => ({}))) as Answer & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not answer that.");
        setAnswer(null);
        return;
      }
      setAnswer(data);
    } catch {
      setError("Network error.");
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
      <form onSubmit={ask} className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="text-base">🧑‍💼</span>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Two best electrical supervisors for a steel job in the USA?"
            className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-400 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={asking || question.trim().length < 3}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40"
        >
          {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {asking ? "Reading the pool…" : "Ask Hanna"}
        </button>
      </form>

      {!answer && !error && (
        <p className="mt-2 text-xs text-slate-500">
          Hanna reads all {poolSize} {poolSize === 1 ? "person" : "people"} on file
          and answers from what is recorded — including what is not.
        </p>
      )}

      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

      {answer && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="text-sm leading-relaxed text-slate-800">{answer.answer}</p>

          {answer.people.length > 0 && (
            <ul className="mt-2.5 space-y-1">
              {answer.people.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/workers/${p.id}`}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-700 hover:text-sky-900"
                  >
                    {p.name}
                    <span className="text-xs font-normal text-slate-500">
                      {p.role ?? "role not recorded"}
                      {p.status === "candidate" ? " · from a CV, nobody has vouched" : ""}
                    </span>
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {answer.blockers.length > 0 && (
            <div className="mt-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                In the way
              </p>
              <ul className="mt-0.5">
                {answer.blockers.map((b) => (
                  <li key={b} className="text-xs text-amber-900">
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* The honest part. A question that turns on a visa cannot be
              answered by a database that has never recorded one, and saying
              so is more useful than a shortlist that ignores it. */}
          {answer.missing.length > 0 && (
            <div className="mt-2.5 rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Nobody has recorded this
              </p>
              <ul className="mt-0.5">
                {answer.missing.map((m) => (
                  <li key={m} className="text-xs text-slate-600">
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
