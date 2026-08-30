import Link from "next/link";
import { AlertTriangle, FileText, Link2Off, Clock } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { getSession } from "@/lib/auth/session";
import { listDocuments, summarizeDocuments } from "@/lib/data/documents";

export const dynamic = "force-dynamic";

// Every file the organization actually holds, and which of them are about to
// stop being valid. This page previously rendered eight invented documents
// from sample-data under a description promising Supabase Storage — the
// storage was real, the page was not.
export default async function DocumentsPage() {
  const session = await getSession();
  if (!session?.organizationId) {
    return (
      <PageHeader
        title="Compliance"
        description="Not available — organization context required."
      />
    );
  }

  const docs = await listDocuments(session.organizationId);
  const stats = summarizeDocuments(docs);

  const CATEGORY_LABEL: Record<string, string> = {
    cv: "CVs",
    a1: "A1 certificates",
    passport: "Passports / ID",
    insurance: "Insurance",
    safety: "Safety & training",
    capability_statement: "Capability statements",
    packet: "Submission packets",
    other: "Other",
  };

  const groups = new Map<string, typeof docs>();
  for (const d of docs) {
    const key = d.category;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(d);
  }

  const TONE: Record<string, string> = {
    expired: "bg-rose-100 text-rose-800",
    expiring_soon: "bg-amber-100 text-amber-800",
    valid: "bg-emerald-50 text-emerald-700",
    no_expiry: "bg-slate-100 text-slate-500",
  };
  const LABEL: Record<string, string> = {
    expired: "Expired",
    expiring_soon: "Expires soon",
    valid: "Valid",
    no_expiry: "No expiry",
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Compliance"
        description="Every document the organization holds, and which of them are about to stop being valid."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Documents held", value: stats.total, icon: FileText, tone: "text-slate-700" },
          { label: "Expired", value: stats.expired, icon: AlertTriangle, tone: "text-rose-700" },
          { label: "Expiring within 30 days", value: stats.expiringSoon, icon: Clock, tone: "text-amber-700" },
          { label: "Not linked to anyone", value: stats.unlinked, icon: Link2Off, tone: "text-slate-500" },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4">
            <Icon className={`h-4 w-4 ${tone}`} />
            <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      {docs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
          <p className="text-sm font-medium text-slate-700">No documents yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Certificates and CVs land here when you attach them to a worker, and
            submission packets when you generate one. Nothing is stored until
            you upload it.
          </p>
          <Link
            href="/workers"
            className="mt-3 inline-block text-xs font-medium text-sky-700 underline"
          >
            Open the Talent Pool
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from(groups.entries()).map(([category, items]) => (
            <section key={category}>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">
                  {CATEGORY_LABEL[category] ?? category}
                </h2>
                <span className="text-xs text-slate-500">{items.length}</span>
              </div>
              <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                {items.map((d) => (
                  <div
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {d.title}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {[
                          d.linkedEntityName ??
                            (d.linkedEntityType ? d.linkedEntityType : "not linked"),
                          d.fileName,
                          d.fileSize ? `${Math.round(d.fileSize / 1024)} KB` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {d.expiryDate && (
                        <span className="text-xs text-slate-500">
                          {new Date(d.expiryDate).toLocaleDateString([], {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE[d.expiryStatus]}`}
                      >
                        {LABEL[d.expiryStatus]}
                      </span>
                      {d.linkedEntityType === "worker" && d.linkedEntityId && (
                        <Link
                          href={`/workers/${d.linkedEntityId}`}
                          className="text-xs font-medium text-sky-700 hover:text-sky-900"
                        >
                          Open
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
