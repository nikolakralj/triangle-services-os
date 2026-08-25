"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SyncTotals {
  fetched: number;
  leadsCreated: number;
  noiseDiscarded: number;
  alreadySeen: number;
  errors: number;
}

interface SyncResponse {
  totals?: SyncTotals;
  summaries?: Array<{ account: string; errors: string[] }>;
  message?: string;
  error?: string;
}

export function JobIntakeSyncButton() {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function sync(sinceDays?: number) {
    setSyncing(true);
    setResult(null);
    setProblem(null);
    try {
      const res = await fetch("/api/job-intake/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sinceDays ? { sinceDays } : {}),
      });
      const data = (await res.json().catch(() => ({}))) as SyncResponse;

      if (!res.ok) {
        setProblem(data.error ?? "Sync failed. Please try again.");
        return;
      }
      if (data.message) {
        setProblem(data.message);
        return;
      }

      const t = data.totals;
      if (t) {
        setResult(
          `Read ${t.fetched} email${t.fetched === 1 ? "" : "s"} · ` +
            `${t.leadsCreated} new opportunit${t.leadsCreated === 1 ? "y" : "ies"} · ` +
            `${t.noiseDiscarded} noise discarded`,
        );
      }

      // Surface the first real failure rather than hiding it behind a total.
      const firstError = data.summaries?.flatMap((s) =>
        s.errors.map((e) => `${s.account}: ${e}`),
      )[0];
      if (firstError) setProblem(firstError);

      router.refresh();
    } catch {
      setProblem("Network error. Please try again.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {result && (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          {result}
        </span>
      )}
      {problem && (
        <span className="inline-flex items-center gap-1 text-xs text-amber-800">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {problem}
        </span>
      )}
      <Button
        variant="secondary"
        className="h-8 px-3 text-xs"
        disabled={syncing}
        onClick={() => void sync()}
      >
        {syncing ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        {syncing ? "Reading mail…" : "Sync now"}
      </Button>

      {/* Backfill: normal syncs only cover new mail since the last run, so
          older opportunities need an explicit reach-back. */}
      <select
        disabled={syncing}
        defaultValue=""
        onChange={(e) => {
          const days = Number(e.target.value);
          e.currentTarget.value = "";
          if (days > 0) void sync(days);
        }}
        className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-400 disabled:opacity-50"
        aria-label="Read older mail"
      >
        <option value="">Read older mail…</option>
        <option value="30">Last 30 days</option>
        <option value="90">Last 3 months</option>
        <option value="180">Last 6 months</option>
      </select>
    </div>
  );
}
