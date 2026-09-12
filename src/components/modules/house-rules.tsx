"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Check, Loader2 } from "lucide-react";

// ---------------------------------------------------------------------------
// How an employee works — the CEO types it here, and every run reads it.
//
// The point is that this replaces re-explaining. What is typed here reaches
// the bot on its next wake-up and Triangle's own worker on its next step, so
// nobody pastes instructions into a bot's platform and keeps them in step by
// hand. Kept as versions, so "since when does it do that" has an answer.
// ---------------------------------------------------------------------------

export interface EmployeeHouseRules {
  body: string;
  version: number;
  setAt: string;
}

function changedAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const mins = Math.round((Date.now() - then) / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export function HouseRules({
  employeeId,
  name,
  rules,
  canEdit,
}: {
  employeeId: string;
  name: string;
  rules: EmployeeHouseRules | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(rules?.body ?? "");
  const [saving, setSaving] = useState(false);
  const [savedVersion, setSavedVersion] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/agents/house-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee: employeeId, body }),
      });
      const data = (await res.json().catch(() => null)) as
        | { version?: number; error?: string }
        | null;
      if (!res.ok) {
        setError(data?.error ?? "Could not save.");
        return;
      }
      setSavedVersion(data?.version ?? null);
      setEditing(false);
      router.refresh();
    } catch {
      setError("Could not save.");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50/60 p-2">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-sky-800">
          How {name} works
        </p>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          maxLength={4000}
          autoFocus
          placeholder={"One instruction per line, the way you'd tell a colleague.\nAlways ask for headcount before anything else.\nNever write to an Austrian company in English."}
          className="mt-1.5 w-full resize-y rounded-md border border-slate-300 bg-white p-2 text-[12.5px] leading-relaxed text-slate-800 outline-none focus:border-sky-400"
        />
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          {name} reads this on every job — the bot on its next wake-up. It does not
          change what {name} is allowed to do.
        </p>
        {error && <p className="mt-1 text-[11px] font-medium text-rose-600">{error}</p>}
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-2.5 py-1.5 text-[12px] font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setBody(rules?.body ?? "");
              setEditing(false);
              setError(null);
            }}
            className="rounded-md px-2 py-1.5 text-[12px] text-slate-500 transition hover:text-slate-800"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          <BookOpen className="h-3 w-3" />
          How {name} works
        </p>
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[11px] font-medium text-sky-700 transition hover:text-sky-900"
          >
            {rules ? "Edit" : "Write them"}
          </button>
        )}
      </div>
      {rules ? (
        <>
          <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-700">
            {rules.body}
          </p>
          <p className="mt-1.5 text-[11px] text-slate-400">
            version {savedVersion ?? rules.version} · changed {changedAgo(rules.setAt)}
          </p>
        </>
      ) : (
        <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
          Nothing standing yet. Write how {name} should work and it applies to every
          job, instead of repeating it each time.
        </p>
      )}
    </div>
  );
}
