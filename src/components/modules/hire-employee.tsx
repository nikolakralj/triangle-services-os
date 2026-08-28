"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Copy, KeyRound, Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AGENT_SCOPES, ROLE_PRESETS } from "@/lib/data/agent-scopes";

// ---------------------------------------------------------------------------
// Hiring, without a terminal.
//
// This was a node script. Fine for a developer, useless for a partner — and
// an operating system whose staffing model needs a shell is one only its
// author can run.
//
// The token appears once, here, and is never retrievable. That is the point:
// a credential you can look up again is a credential that leaks.
// ---------------------------------------------------------------------------

export function HireEmployee() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [name, setName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [emoji, setEmoji] = useState("");
  const [scopes, setScopes] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{
    displayName: string;
    name: string;
    token: string;
    rehired: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  function applyPreset(key: string) {
    const p = ROLE_PRESETS.find((r) => r.key === key);
    if (!p) return;
    setDisplayName(p.displayName);
    setName(`triangle_${p.key}`);
    setRoleTitle(p.roleTitle);
    setEmoji(p.emoji);
    setScopes(new Set(p.scopes));
    setError(null);
  }

  function toggleScope(v: string) {
    setScopes((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }

  async function hire() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/agents/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          displayName,
          roleTitle,
          emoji,
          scopes: Array.from(scopes),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not hire them.");
        return;
      }
      setIssued({
        displayName: data.displayName,
        name: data.name,
        token: data.token,
        rehired: Boolean(data.rehired),
      });
      setOpen(false);
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setIssued(null);
    setCopied(false);
    setDisplayName("");
    setName("");
    setRoleTitle("");
    setEmoji("");
    setScopes(new Set());
  }

  // ── The token, shown once ────────────────────────────────────────────────
  if (issued) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
          <KeyRound className="h-4 w-4" />
          {issued.displayName} is hired
          {issued.rehired ? " again — history kept" : ""}
        </p>
        <p className="mt-1 text-xs text-amber-900">
          This is the only time you will see their token. Paste it into the bot
          now, together with their role file. If you lose it, issue a new badge
          — it cannot be looked up.
        </p>

        <div className="mt-2 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md border border-amber-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800">
            {issued.token}
          </code>
          <Button
            variant="secondary"
            className="h-8 shrink-0 px-2.5 text-xs"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(issued.token);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>

        <p className="mt-2 text-xs text-amber-900">
          Badge name <code className="font-mono">{issued.name}</code>
        </p>

        <Button variant="ghost" className="mt-2 h-8 px-2.5 text-xs" onClick={reset}>
          Done
        </Button>
      </div>
    );
  }

  if (!open) {
    return (
      <div>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <UserPlus className="h-4 w-4" />
          Hire an AI employee
        </Button>
        {error && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-rose-600">
            <AlertCircle className="h-4 w-4" />
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-900">Hire an AI employee</p>
      <p className="mt-0.5 text-xs text-slate-500">
        Start from a job we already know, or write your own.
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {ROLE_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => applyPreset(p.key)}
            className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            title={p.description}
          >
            {p.emoji} {p.displayName} — {p.roleTitle.split("·")[0].trim()}
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[80px_1fr]">
        <input
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          placeholder="👤"
          maxLength={4}
          className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-center text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
        />
        <input
          value={displayName}
          onChange={(e) => {
            setDisplayName(e.target.value);
            if (!name) {
              setName(
                `triangle_${e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`,
              );
            }
          }}
          placeholder="Name — e.g. Hanna"
          className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
        />
      </div>

      <input
        value={roleTitle}
        onChange={(e) => setRoleTitle(e.target.value)}
        placeholder="Job — e.g. Resourcing · reads CVs and keeps the pool current"
        className="mt-2 h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
      />

      <input
        value={name}
        onChange={(e) => setName(e.target.value.toLowerCase())}
        placeholder="Badge name — triangle_hr"
        className="mt-2 h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 font-mono text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
      />

      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
        What they are allowed to do
      </p>
      <div className="mt-1.5 space-y-1.5">
        {AGENT_SCOPES.map((s) => (
          <label
            key={s.value}
            className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-2 transition hover:bg-slate-50"
          >
            <input
              type="checkbox"
              checked={scopes.has(s.value)}
              onChange={() => toggleScope(s.value)}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-slate-900"
            />
            <span className="min-w-0">
              <span className="block text-xs font-medium text-slate-800">{s.label}</span>
              <span className="block text-[11px] leading-relaxed text-slate-500">
                {s.description}
              </span>
            </span>
          </label>
        ))}
      </div>

      {error && (
        <p className="mt-2 flex items-start gap-1.5 text-sm text-rose-600">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Button
          variant="primary"
          disabled={busy || !displayName.trim() || !name.trim() || scopes.size === 0}
          onClick={() => void hire()}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Hire {displayName || "them"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
