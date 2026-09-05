import Link from "next/link";
import { MessageSquare } from "lucide-react";
import type { Worker } from "@/lib/types";

// ---------------------------------------------------------------------------
// The pool, as people.
//
// This was an eleven-column table that needed horizontal scrolling to reach
// the rate, and wrapped every skill list into three lines. Nobody scans a
// roster that way. The questions being asked are "who is free", "what can they
// do", "what do they cost" — so those are what a card shows, and everything
// else lives on the profile.
// ---------------------------------------------------------------------------

const AVAILABILITY: Record<string, { label: string; cls: string }> = {
  available: { label: "Available", cls: "bg-emerald-100 text-emerald-800" },
  available_soon: { label: "Soon", cls: "bg-amber-100 text-amber-800" },
  busy: { label: "On a job", cls: "bg-slate-200 text-slate-600" },
  unknown: { label: "Unknown", cls: "bg-slate-100 text-slate-500" },
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function WorkerCards({
  workers,
  noteCounts,
}: {
  workers: Worker[];
  noteCounts?: Record<string, number>;
}) {
  if (workers.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
        <p className="text-sm font-medium text-slate-700">Nobody matches that</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
          Try clearing a filter — or import more of the roster if the person you
          are looking for is not in Triangle yet.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {workers.map((w) => {
        const avail = AVAILABILITY[w.availabilityStatus] ?? AVAILABILITY.unknown;
        const rate =
          w.dailyRateExpectation != null
            ? `${w.dailyRateExpectation} ${w.currency}/day`
            : w.hourlyRateExpectation != null
              ? `${w.hourlyRateExpectation} ${w.currency}/h`
              : null;
        const notes = noteCounts?.[w.id] ?? 0;

        return (
          <Link
            key={w.id}
            href={`/workers/${w.id}`}
            className="group rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700 group-hover:bg-slate-900 group-hover:text-white">
                {initials(w.fullName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-950">
                  {w.fullName}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {w.role ?? "Role not recorded"}
                  {w.country ? ` · ${w.country}` : ""}
                </p>
              </div>
              {/* A candidate is someone a CV told us about and nobody has
                  vouched for yet. They cannot be matched to a package or put
                  in front of a buyer until somebody does, so the card says
                  which of the two this is rather than showing an availability
                  that has never been confirmed by a person. */}
              {w.status === "candidate" ? (
                <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800">
                  From a CV
                </span>
              ) : (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${avail.cls}`}
                >
                  {avail.label}
                </span>
              )}
            </div>

            {(w.skills.length > 0 || w.certificates.length > 0) && (
              <div className="mt-3 flex flex-wrap gap-1">
                {w.certificates.slice(0, 3).map((c: string) => (
                  <span
                    key={c}
                    className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700"
                  >
                    {c}
                  </span>
                ))}
                {w.skills.slice(0, 3).map((s: string) => (
                  <span
                    key={s}
                    className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600"
                  >
                    {s}
                  </span>
                ))}
                {w.skills.length > 3 && (
                  <span className="px-1 py-0.5 text-[11px] text-slate-400">
                    +{w.skills.length - 3}
                  </span>
                )}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
              <span>
                {w.availableFrom
                  ? `From ${new Date(w.availableFrom).toLocaleDateString([], {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}`
                  : w.languages.length > 0
                    ? w.languages.slice(0, 2).join(", ")
                    : ""}
              </span>
              <span className="flex items-center gap-2">
                {notes > 0 && (
                  <span className="inline-flex items-center gap-0.5" title={`${notes} recorded`}>
                    <MessageSquare className="h-3 w-3" />
                    {notes}
                  </span>
                )}
                {rate && <span className="font-medium text-slate-700">{rate}</span>}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
