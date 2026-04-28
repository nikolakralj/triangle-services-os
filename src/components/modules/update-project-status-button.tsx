"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

const STATUS_CONFIG: Record<
  string,
  { label: string; nextStatus: string; className: string }
> = {
  new: {
    label: "Mark contractor chain research",
    nextStatus: "researching",
    className:
      "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50",
  },
  researching: {
    label: "Mark as qualified",
    nextStatus: "qualified",
    className:
      "w-full rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100",
  },
  qualified: {
    label: "Mark as contacted",
    nextStatus: "contacted",
    className:
      "w-full rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-800 hover:bg-sky-100",
  },
  contacted: {
    label: "Mark as won",
    nextStatus: "won",
    className:
      "w-full rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100",
  },
};

export function UpdateProjectStatusButton({
  projectId,
  currentStatus,
}: {
  projectId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = STATUS_CONFIG[currentStatus];
  if (!config) return null;

  const handleUpdate = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/hunter/projects/${projectId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: config.nextStatus }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Failed to update status");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleUpdate}
        disabled={isLoading}
        className={config.className}
      >
        {isLoading ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Updating…
          </span>
        ) : (
          config.label
        )}
      </button>
      {error && (
        <p className="mt-1 text-xs text-rose-600">{error}</p>
      )}
    </div>
  );
}
