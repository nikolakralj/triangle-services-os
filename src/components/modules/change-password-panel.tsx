"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

// Until this existed, a forgotten password meant a database admin had to reset
// it by hand — which is how a temporary password ended up in a chat log. The
// update runs against the signed-in session, so the new password is set by the
// account owner and never travels through anyone else.

const MIN_LENGTH = 10;

export function ChangePasswordPanel() {
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && next !== confirm;
  const ready = next.length >= MIN_LENGTH && next === confirm && !saving;

  async function save() {
    setSaving(true);
    setError(null);
    setDone(false);
    try {
      const supabase = createBrowserSupabaseClient();
      if (!supabase) {
        setError("Authentication is not configured in this environment.");
        return;
      }
      const { error: err } = await supabase.auth.updateUser({ password: next });
      if (err) {
        setError(err.message);
        return;
      }
      setNext("");
      setConfirm("");
      setDone(true);
    } catch {
      setError("Could not change the password. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-md space-y-3">
      <p className="text-sm text-slate-600">
        Set your own password. It applies everywhere you sign in — this site and
        local development share one account.
      </p>

      <label className="block">
        <span className="text-xs font-medium text-slate-700">New password</span>
        <input
          type="password"
          value={next}
          autoComplete="new-password"
          onChange={(e) => setNext(e.target.value)}
          placeholder={`At least ${MIN_LENGTH} characters`}
          className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium text-slate-700">Confirm password</span>
        <input
          type="password"
          value={confirm}
          autoComplete="new-password"
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Type it again"
          className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
        />
      </label>

      {tooShort && (
        <p className="text-xs text-amber-700">
          Use at least {MIN_LENGTH} characters.
        </p>
      )}
      {mismatch && (
        <p className="text-xs text-amber-700">The two passwords do not match.</p>
      )}
      {error && (
        <p className="flex items-start gap-1.5 text-xs text-rose-600">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
      {done && (
        <p className="flex items-center gap-1.5 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Password changed. Use it next time you sign in.
        </p>
      )}

      <Button
        variant="primary"
        className="h-8 px-3 text-xs"
        disabled={!ready}
        onClick={() => void save()}
      >
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <KeyRound className="h-3.5 w-3.5" />
        )}
        Change password
      </Button>
    </div>
  );
}
