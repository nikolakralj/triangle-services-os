"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Radar, Loader2 } from "lucide-react";

export function HuntNowButton({ sectorId }: { sectorId: string }) {
  const router = useRouter();
  const [isHunting, setIsHunting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleHunt = async () => {
    setIsHunting(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch("/api/hunter/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectorId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Hunt failed");
      }

      setResult(
        `✓ Found ${data.newProjects ?? 0} new projects (${data.duplicates ?? 0} duplicates filtered)`,
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsHunting(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={handleHunt}
        disabled={isHunting}
        className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-sky-500 to-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-sky-600 hover:to-emerald-600 disabled:opacity-60"
      >
        {isHunting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Hunting…
          </>
        ) : (
          <>
            <Radar className="h-4 w-4" />
            Hunt now
          </>
        )}
      </button>
      {result && (
        <p className="rounded-md bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
          {result}
        </p>
      )}
      {error && (
        <p className="rounded-md bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">
          ✗ {error}
        </p>
      )}
    </div>
  );
}
