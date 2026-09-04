"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lightbulb, Loader2, User, Bot, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Play } from "@/lib/data/plays";

// ---------------------------------------------------------------------------
// What an employee thinks you should do next.
//
// Asked why it could not find a direct number for a plant manager, Scout gave
// the most useful answer it has produced — stop scraping, because UK plant
// managers do not publish direct dials; call the switchboard and ask for him,
// or go through the named EPC who already knows him, or trial a paid vendor
// against a fixed list before buying a year of it.
//
// That reasoning had nowhere to land. A finding is a claim about a thing; an
// assignment is work already decided on. So the best output an employee
// produces sat in a chat window, and the app went on asking for form fields.
//
// Here it is a decision the size of one click. No fields.
// ---------------------------------------------------------------------------

export function PlaysPanel({ plays }: { plays: Play[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (plays.length === 0) return null;

  async function choose(findingId: string, optionId: string) {
    setBusy(`${findingId}:${optionId}`);
    setError(null);
    try {
      const res = await fetch("/api/plays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ findingId, optionId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not act on that.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mb-4 space-y-3">
      {error && (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
      )}

      {plays.map((play) => (
        <div
          key={play.findingId}
          className="rounded-xl border border-violet-200 bg-violet-50/60 p-4"
        >
          <p className="flex items-center gap-2 text-sm font-semibold text-violet-950">
            <Lightbulb className="h-4 w-4 text-violet-600" />
            {play.agentEmoji ?? "🤖"} {play.agentName ?? "An employee"} has an idea
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">{play.headline}</p>
          {play.situation && (
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-600">
              {play.situation}
            </p>
          )}

          <div className="mt-3 space-y-2">
            {play.options.map((opt) => {
              const key = `${play.findingId}:${opt.id}`;
              const isRecommended = play.recommended === opt.id;
              return (
                <div
                  key={opt.id}
                  className={`rounded-lg border bg-white p-3 ${
                    isRecommended ? "border-violet-300 ring-1 ring-violet-200" : "border-slate-200"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                        {opt.actor === "agent" ? (
                          <Bot className="h-3.5 w-3.5 text-sky-600" />
                        ) : (
                          <User className="h-3.5 w-3.5 text-amber-600" />
                        )}
                        {opt.action}
                        {isRecommended && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800">
                            <Star className="h-2.5 w-2.5" />
                            their pick
                          </span>
                        )}
                      </p>
                      {opt.why && (
                        <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                          {opt.why}
                        </p>
                      )}
                      <p className="mt-1 text-[11px] text-slate-500">
                        {opt.actor === "agent"
                          ? "Becomes their next job"
                          : "Becomes your next action — an employee cannot do this one"}
                        {opt.odds ? ` · odds ${opt.odds}` : ""}
                      </p>
                    </div>
                    <Button
                      variant={isRecommended ? "primary" : "secondary"}
                      className="h-7 shrink-0 px-2.5 text-xs"
                      disabled={busy !== null}
                      onClick={() => void choose(play.findingId, opt.id)}
                    >
                      {busy === key ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : null}
                      Do this
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
