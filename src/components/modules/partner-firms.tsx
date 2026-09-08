"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, Loader2, Plus } from "lucide-react";

// ---------------------------------------------------------------------------
// The half of the talent pool that is not individual people.
//
// Triangle has two people on the bench. A crew of eight electricians is not
// assembled from two — it comes from a partner firm that already employs
// eight. This is where those firms live.
//
// The list is sorted by whether the firm can actually be sold, not by name.
// A firm nobody has confirmed sits below one that was confirmed on Tuesday,
// with the reason spelled out, because "we have a partner in Poland" is the
// exact sentence that turns into a package that cannot be delivered.
// ---------------------------------------------------------------------------

export interface PartnerRow {
  id: string;
  name: string;
  country: string | null;
  city: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  trades: string[];
  crewSize: number | null;
  canPostTo: string[];
  availabilityStatus: string;
  confirmedDaysAgo: number | null;
  confirmedNote: string | null;
  sellable: boolean;
  notSellableBecause: string | null;
  status: string;
}

const AVAILABILITY_LABEL: Record<string, string> = {
  available: "Available",
  available_soon: "Available soon",
  busy: "Busy",
  unknown: "Not stated",
  do_not_use: "Do not use",
};

export function PartnerFirms({ partners }: { partners: PartnerRow[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const sellable = partners.filter((p) => p.sellable);

  async function addFirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy("new");
    setError(null);
    try {
      const res = await fetch("/api/supply-partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          country: form.get("country"),
          city: form.get("city"),
          contactName: form.get("contactName"),
          contactPhone: form.get("contactPhone"),
          contactEmail: form.get("contactEmail"),
          trades: form.get("trades"),
          canPostTo: form.get("canPostTo"),
          crewSize: form.get("crewSize"),
          notes: form.get("notes"),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not add the firm.");
        return;
      }
      setAdding(false);
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(null);
    }
  }

  async function confirmCapacity(e: React.FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(id);
    setError(null);
    try {
      const res = await fetch("/api/supply-partners", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerId: id,
          action: "confirm",
          crewSize: form.get("crewSize"),
          availabilityStatus: form.get("availabilityStatus"),
          availableFrom: form.get("availableFrom") || undefined,
          note: form.get("note"),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not record it.");
        return;
      }
      setConfirming(null);
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <Building2 className="h-4 w-4 text-slate-400" />
            Partner firms
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {partners.length === 0
              ? "Crews larger than the bench come from partner firms. None on file."
              : `${sellable.length} of ${partners.length} can be put forward today — the rest need their capacity confirmed.`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 transition hover:bg-slate-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Add a firm
        </button>
      </div>

      {adding && (
        <form onSubmit={addFirm} className="border-b border-slate-100 bg-slate-50 px-4 py-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <Field name="name" label="Firm name" required placeholder="Elektro Novak d.o.o." />
            <Field name="country" label="Country" placeholder="HR" />
            <Field name="city" label="City" placeholder="Split" />
            <Field
              name="trades"
              label="Trades (comma separated)"
              placeholder="electrical installation, cable pulling"
            />
            <Field name="crewSize" label="Crew size they can field" placeholder="8" />
            <Field
              name="canPostTo"
              label="Can post workers to"
              placeholder="DE, AT, NL"
            />
            <Field name="contactName" label="Who answers" placeholder="Ivan Novak" />
            <Field name="contactPhone" label="Phone" placeholder="+385 …" />
            <Field name="contactEmail" label="Email" placeholder="ivan@…" />
          </div>
          <div className="mt-2">
            <Field name="notes" label="Notes" placeholder="Met on the Rijeka job, 2024" />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Added as unconfirmed. Capacity counts as real only once somebody has
            spoken to them — use Confirm capacity after the call.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="submit"
              disabled={busy === "new"}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40"
            >
              {busy === "new" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Add firm
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="h-8 px-2 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && <p className="px-4 py-2 text-sm text-rose-600">{error}</p>}

      {partners.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {partners.map((p) => (
            <li key={p.id} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">
                    {p.name}
                    {p.country ? (
                      <span className="ml-1.5 text-xs font-normal text-slate-500">
                        {[p.city, p.country].filter(Boolean).join(", ")}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    {p.trades.length > 0 ? p.trades.join(", ") : "Trades not recorded"}
                    {p.crewSize !== null ? ` · up to ${p.crewSize}` : ""}
                    {p.canPostTo.length > 0 ? ` · posts to ${p.canPostTo.join(", ")}` : ""}
                  </p>
                  {p.contactName || p.contactPhone ? (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {p.contactName ?? "No name recorded"}
                      {p.contactPhone ? ` · ${p.contactPhone}` : ""}
                    </p>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  {p.sellable ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      <Check className="h-3 w-3" />
                      {AVAILABILITY_LABEL[p.availabilityStatus] ?? p.availabilityStatus}
                      {p.confirmedDaysAgo === 0
                        ? " · confirmed today"
                        : ` · confirmed ${p.confirmedDaysAgo}d ago`}
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                      {p.notSellableBecause}
                    </span>
                  )}
                  <div className="mt-1">
                    <button
                      type="button"
                      onClick={() => setConfirming(confirming === p.id ? null : p.id)}
                      className="text-xs font-medium text-sky-700 hover:text-sky-900"
                    >
                      {confirming === p.id ? "Close" : "Confirm capacity"}
                    </button>
                  </div>
                </div>
              </div>

              {p.confirmedNote && confirming !== p.id && (
                <p className="mt-1.5 text-xs italic text-slate-500">
                  Last heard: {p.confirmedNote}
                </p>
              )}

              {confirming === p.id && (
                <form
                  onSubmit={(e) => confirmCapacity(e, p.id)}
                  className="mt-2 rounded-lg bg-slate-50 p-3"
                >
                  <p className="mb-2 text-xs text-slate-600">
                    After you have spoken to them. What did they actually say?
                  </p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Field
                      name="crewSize"
                      label="Heads they can field"
                      placeholder={p.crewSize !== null ? String(p.crewSize) : "8"}
                    />
                    <label className="block">
                      <span className="mb-0.5 block text-[11px] font-medium text-slate-600">
                        Availability
                      </span>
                      <select
                        name="availabilityStatus"
                        defaultValue={
                          p.availabilityStatus === "unknown"
                            ? "available"
                            : p.availabilityStatus
                        }
                        className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-900"
                      >
                        <option value="available">Available</option>
                        <option value="available_soon">Available soon</option>
                        <option value="busy">Busy</option>
                        <option value="do_not_use">Do not use</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-0.5 block text-[11px] font-medium text-slate-600">
                        Free from
                      </span>
                      <input
                        type="date"
                        name="availableFrom"
                        className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-900"
                      />
                    </label>
                  </div>
                  <div className="mt-2">
                    <Field
                      name="note"
                      label="What they said"
                      placeholder="Ivan: six electricians free from mid-October, two have German A1 already"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={busy === p.id}
                    className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40"
                  >
                    {busy === p.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Record it
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({
  name,
  label,
  placeholder,
  required,
}: {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-medium text-slate-600">{label}</span>
      <input
        name={name}
        required={required}
        placeholder={placeholder}
        className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-400 focus:outline-none"
      />
    </label>
  );
}
