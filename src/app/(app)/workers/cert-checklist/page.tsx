import Link from "next/link";
import { AlertTriangle, Clock, CheckCircle2, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/session";
import { listCertAlerts } from "@/lib/data/worker-documents";
import { CERT_TYPES } from "@/lib/data/worker-documents-types";
import type { CertAlertRow } from "@/lib/data/worker-documents";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const CERT_LABEL: Record<string, string> = Object.fromEntries(
  CERT_TYPES.map((c) => [c.value, c.label]),
);

function statusLabel(row: CertAlertRow) {
  if (row.expiryStatus === "expired") {
    const days = Math.abs(row.daysUntilExpiry);
    return `Expired ${days}d ago`;
  }
  return `${row.daysUntilExpiry}d left`;
}

function StatusBadge({ row }: { row: CertAlertRow }) {
  if (row.expiryStatus === "expired") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
        <AlertTriangle className="h-3 w-3" />
        {statusLabel(row)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
      <Clock className="h-3 w-3" />
      {statusLabel(row)}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default async function CertChecklistPage() {
  const session = await requireSession();
  const rows = await listCertAlerts(session.organizationId);

  const expired = rows.filter((r) => r.expiryStatus === "expired");
  const expiringSoon = rows.filter((r) => r.expiryStatus === "expiring_soon");

  return (
    <>
      <PageHeader
        title="Cert Expiry Alerts"
        description="Worker certificates expiring within 60 days or already expired."
        actions={
          <Link
            href="/workers"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Talent Pool
          </Link>
        }
      />

      {/* Summary chips */}
      <div className="mb-4 flex gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <span className="text-sm font-semibold text-red-700">
            {expired.length} expired
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5">
          <Clock className="h-4 w-4 text-amber-600" />
          <span className="text-sm font-semibold text-amber-700">
            {expiringSoon.length} expiring within 30 days
          </span>
        </div>
        {rows.length === 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-semibold text-emerald-700">
              All certs valid
            </span>
          </div>
        )}
      </div>

      <Card>
        <CardHeader
          title="Certificates requiring action"
          description="Sorted by urgency. Click a worker name to open their profile and re-upload."
        />
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="px-6 py-8 text-sm text-slate-500">
              No certificates expiring within the next 60 days.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-5 py-3">Worker</th>
                  <th className="px-5 py-3">Certificate</th>
                  <th className="px-5 py-3">Document title</th>
                  <th className="px-5 py-3">Expiry date</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.documentId}
                    className={
                      row.expiryStatus === "expired"
                        ? "border-b border-slate-100 bg-red-50/40"
                        : "border-b border-slate-100"
                    }
                  >
                    <td className="px-5 py-3 font-medium text-slate-800">
                      <Link
                        href={`/workers/${row.workerId}`}
                        className="hover:text-sky-600 hover:underline"
                      >
                        {row.workerName}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {CERT_LABEL[row.certType] ?? row.certType}
                    </td>
                    <td className="px-5 py-3 text-slate-500">{row.title}</td>
                    <td className="px-5 py-3 text-slate-600">{row.expiryDate}</td>
                    <td className="px-5 py-3">
                      <StatusBadge row={row} />
                    </td>
                    <td className="px-5 py-3">
                      <Link
                        href={`/workers/${row.workerId}`}
                        className="text-xs font-medium text-sky-600 hover:underline"
                      >
                        Open profile →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
