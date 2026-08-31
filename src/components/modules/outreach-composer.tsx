"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Write to a buyer.
//
// The project page could edit, send-mark and archive outreach, but nothing
// created it. Scout would find that JSM Group buys the labour on a 110 kV
// cable route and name Peter Östlund as its Geschäftsführer, and the trail
// ended there.
//
// This is the step that turns a name into a message. It does not send —
// nothing in Triangle does. You read it, change what is wrong, send it from
// your own mail, then mark it sent.
// ---------------------------------------------------------------------------

interface BuyerOption {
  key: string;
  contactId?: string | null;
  suggestionId?: string | null;
  name: string;
  company: string;
  title?: string | null;
}

interface PackageOption {
  id: string;
  title: string;
}

const CHANNELS = [
  { value: "email_cold", label: "Email — first approach" },
  { value: "email_followup", label: "Email — follow-up" },
  { value: "linkedin_connect", label: "LinkedIn — connection note" },
  { value: "linkedin_message", label: "LinkedIn — message" },
];

export function OutreachComposer({
  projectId,
  buyers,
  packages,
}: {
  projectId: string;
  buyers: BuyerOption[];
  packages: PackageOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [buyerKey, setBuyerKey] = useState(buyers[0]?.key ?? "");
  const [packageId, setPackageId] = useState("");
  const [channel, setChannel] = useState("email_cold");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (buyers.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        No buyer identified yet. Map the contractor chain and accept a buyer
        contact first — there is no one to write to until then.
      </p>
    );
  }

  const buyer = buyers.find((b) => b.key === buyerKey);

  async function draft() {
    if (!buyer) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/research/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          buyerContactId: buyer.contactId ?? undefined,
          buyerSuggestionId: buyer.contactId ? undefined : buyer.suggestionId,
          projectPackageId: packageId || undefined,
          channel,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not draft that.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div>
        <Button variant="secondary" className="h-8 text-xs" onClick={() => setOpen(true)}>
          <PenLine className="h-3.5 w-3.5" />
          Write to a buyer
        </Button>
        {error && (
          <p className="mt-1.5 flex items-center gap-1 text-xs text-rose-600">
            <AlertCircle className="h-3.5 w-3.5" />
            {error}
          </p>
        )}
      </div>
    );
  }

  const selectCls =
    "h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400";

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <p className="mb-2 text-xs font-semibold text-slate-900">Write to a buyer</p>

      <div className="space-y-2">
        <select
          value={buyerKey}
          onChange={(e) => setBuyerKey(e.target.value)}
          className={selectCls}
        >
          {buyers.map((b) => (
            <option key={b.key} value={b.key}>
              {b.name}
              {b.title ? ` — ${b.title}` : ""} · {b.company}
              {b.suggestionId && !b.contactId ? " (not yet accepted)" : ""}
            </option>
          ))}
        </select>

        <select
          value={packageId}
          onChange={(e) => setPackageId(e.target.value)}
          className={selectCls}
        >
          <option value="">
            No specific package — ask what they are resourcing
          </option>
          {packages.map((p) => (
            <option key={p.id} value={p.id}>
              Offer: {p.title}
            </option>
          ))}
        </select>

        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          className={selectCls}
        >
          {CHANNELS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <Button
          variant="primary"
          className="h-8 px-3 text-xs"
          disabled={busy || !buyer}
          onClick={() => void draft()}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PenLine className="h-3.5 w-3.5" />}
          {busy ? "Writing…" : "Draft it"}
        </Button>
        <Button
          variant="ghost"
          className="h-8 px-2.5 text-xs"
          disabled={busy}
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        Nothing is sent. You get a draft to read and edit, and you send it
        yourself — then mark it sent so the follow-up is tracked.
      </p>

      {error && (
        <p className="mt-1.5 flex items-start gap-1 text-xs text-rose-600">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
