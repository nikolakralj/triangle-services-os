"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

const EXAMPLES = [
  "Rail and rolling stock work always scores at least 75 — it is our strongest sector.",
  "Anything shorter than 3 months scores below 30, however good it looks.",
  "Germany, Austria and Croatia matter most. Score them higher than the UK.",
  "Treat data centre fit-out as high potential — those sites always need crews.",
  "If the email mentions supervisors or site managers, add 10 to the score.",
];

export function IntakeRulesPanel() {
  const [body, setBody] = useState("");
  const [savedBody, setSavedBody] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const dirty = body !== savedBody;

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/job-intake/rules");
        if (!res.ok) return;
        const data = (await res.json()) as {
          rules: { body: string; updatedAt: string | null };
        };
        setBody(data.rules.body);
        setSavedBody(data.rules.body);
        setUpdatedAt(data.rules.updatedAt);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setJustSaved(false);
    try {
      const res = await fetch("/api/job-intake/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        rules?: { body: string; updatedAt: string | null };
        error?: string;
      };
      if (!res.ok || !data.rules) {
        setError(data.error ?? "Could not save. Please try again.");
        return;
      }
      setSavedBody(data.rules.body);
      setBody(data.rules.body);
      setUpdatedAt(data.rules.updatedAt);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function addExample(text: string) {
    setBody((b) => (b.trim() ? `${b.trim()}\n${text}` : text));
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Write in plain English what your organization actually wants. These rules are read
        by the AI on every email it classifies, and they take priority over the
        built-in scoring. One instruction per line.
      </p>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            placeholder={
              "e.g.\nRail and rolling stock work always scores at least 75.\nAnything shorter than 3 months scores below 30.\nGermany, Austria and Croatia matter most."
            }
            className="w-full resize-y rounded-md border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
          />

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-500">Add an example:</span>
            {EXAMPLES.map((ex, i) => (
              <button
                key={i}
                type="button"
                onClick={() => addExample(ex)}
                title={ex}
                className="max-w-56 truncate rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:border-slate-300 hover:text-slate-900"
              >
                {ex}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-400">
              {updatedAt
                ? `Last saved ${new Date(updatedAt).toLocaleString()}`
                : "No rules yet — the built-in scoring is being used."}
            </p>
            <div className="flex items-center gap-2">
              {error && (
                <span className="inline-flex items-center gap-1 text-xs text-rose-600">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  {error}
                </span>
              )}
              {justSaved && !dirty && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                  <CheckCircle2 className="h-3 w-3 shrink-0" />
                  Saved — applies from the next sync
                </span>
              )}
              <Button
                variant="primary"
                className="h-8 px-3 text-xs"
                disabled={saving || !dirty}
                onClick={() => void save()}
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save rules
              </Button>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            These change what scores highly and what counts as relevant. They
            cannot make the AI invent facts — anything a recruiter did not write
            still shows as &ldquo;not stated&rdquo;.
          </p>
        </>
      )}
    </div>
  );
}
