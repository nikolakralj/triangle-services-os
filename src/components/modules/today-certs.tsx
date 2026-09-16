"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { KindChip } from "@/components/modules/today-missions";
import { CERT_TYPES } from "@/lib/data/worker-documents-types";
import type { CertAlertRow } from "@/lib/data/worker-documents";

// Certificate exceptions in Needs you (DEV-011). Cert Alerts left the menu:
// an expired A1 or safety card is a person's job to renew, so it is a card
// here, with the same kind chip as every other Needs you card, and the rest
// of the pool is one filter away in Talent. Nothing is sent from here.

const CERT_LABEL: Record<string, string> = Object.fromEntries(
  CERT_TYPES.map((c) => [c.value, c.label]),
);

const SHOWN = 5;

function when(row: CertAlertRow): string {
  if (row.expiryStatus === "expired") {
    const d = Math.abs(row.daysUntilExpiry);
    return d === 0 ? "expired today" : `expired ${d} ${d === 1 ? "day" : "days"} ago`;
  }
  return row.daysUntilExpiry === 0
    ? "expires today"
    : `${row.daysUntilExpiry} ${row.daysUntilExpiry === 1 ? "day" : "days"} left`;
}

export function CertExceptions({ certs }: { certs: CertAlertRow[] }) {
  if (certs.length === 0) return null;
  const expired = certs.filter((c) => c.expiryStatus === "expired").length;
  const soon = certs.length - expired;
  const shown = certs.slice(0, SHOWN);
  const more = certs.length - shown.length;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <p className="flex items-center gap-2 text-[13px] text-slate-700">
          <ShieldAlert className="h-4 w-4 text-amber-600" aria-hidden />
          <span className="font-semibold text-slate-900">Certificates</span>
          <span className="text-slate-500">
            {expired > 0 ? `${expired} expired` : ""}
            {expired > 0 && soon > 0 ? " · " : ""}
            {soon > 0 ? `${soon} expiring within 30 days` : ""}
          </span>
        </p>
        <Link
          href="/workers?certs=attention"
          className="text-[12px] font-medium text-sky-700 hover:text-sky-900"
        >
          Filter in Talent →
        </Link>
      </div>
      <ul className="divide-y divide-slate-100">
        {shown.map((row) => (
          <li key={row.documentId}>
            <Link
              href={`/workers/${row.workerId}`}
              className="flex items-start gap-3 px-4 py-2.5 transition hover:bg-slate-50"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-900">
                  <KindChip kind="Renew" />
                  {row.workerName}
                </span>
                <span
                  className={`mt-0.5 block text-[13px] leading-snug ${
                    row.expiryStatus === "expired" ? "text-rose-700" : "text-amber-900"
                  }`}
                >
                  {CERT_LABEL[row.certType] ?? row.certType}
                  {" — "}
                  {when(row)}
                </span>
              </span>
              <span className="shrink-0 pt-0.5 text-[12px] font-medium text-sky-700">
                Open profile →
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {more > 0 && (
        <p className="border-t border-slate-100 px-4 py-2 text-[11.5px] text-slate-500">
          {more} more in{" "}
          <Link href="/workers/cert-checklist" className="font-medium text-sky-700 hover:text-sky-900">
            the full certificate list
          </Link>
          .
        </p>
      )}
    </div>
  );
}
