"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { closeClientTabAction, pinClientTabAction } from "@/app/(app)/client-tabs/actions";
import type { ClientTabCloseReason } from "@/lib/data/client-tab-policy";

/** On a company page: pin it as a client tab. One click, no form. */
export function PinClientTabButton({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await pinClientTabAction(companyId);
            if (!result.ok) return setError(result.error);
            router.push(`/client-tabs/${encodeURIComponent(result.companyId ?? companyId)}`);
          })
        }
      >
        Pin as client tab
      </button>
      {error ? <span className="text-xs text-rose-700">{error}</span> : null}
    </span>
  );
}

const CLOSE_LABEL: Record<ClientTabCloseReason, string> = { won: "Won", lost: "Lost", quiet: "Gone quiet" };

/** On the tab: close it. The lines stay on the company for the bots. */
export function CloseClientTab({ tabId }: { tabId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-xs text-slate-500">
      Close tab:
      {(Object.keys(CLOSE_LABEL) as ClientTabCloseReason[]).map((reason) => (
        <button
          key={reason}
          type="button"
          disabled={pending}
          className="rounded border border-slate-200 px-2 py-0.5 hover:bg-slate-100"
          onClick={() =>
            start(async () => {
              setError(null);
              const result = await closeClientTabAction(tabId, reason);
              if (!result.ok) return setError(result.error);
              router.refresh();
            })
          }
        >
          {CLOSE_LABEL[reason]}
        </button>
      ))}
      {error ? <span className="text-rose-700">{error}</span> : null}
    </span>
  );
}
