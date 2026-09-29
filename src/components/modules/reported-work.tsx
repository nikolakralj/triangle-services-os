import Link from "next/link";
import {
  formatReportDate,
  reportSentence,
  type AccessNeededLine,
  type ReportView,
} from "@/lib/data/employee-report-policy";

// ---------------------------------------------------------------------------
// What an employee reported, on the record it belongs to. No buttons: the
// employee already decided, and a person reads it.
// ---------------------------------------------------------------------------

export function ReportedWork({ reports }: { reports: ReportView[] }) {
  if (reports.length === 0) return null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5" aria-label="What the team reported">
      <h2 className="text-sm font-semibold text-slate-950">What the team reported</h2>
      <ul className="mt-3 space-y-2">
        {reports.map((report) => (
          <li key={report.id} className="min-w-0 break-words text-sm leading-6 text-slate-700">
            <span className="text-slate-500">{formatReportDate(report.occurredOn)}</span>
            {" · "}
            {report.source === "mailbox" ? "From the mailbox" : report.employeeName}
            {" · "}
            {reportSentence(report)}
            {report.note ? <span className="text-slate-600"> {report.note}</span> : null}
            {report.evidenceUrl ? (
              <>
                {" "}
                <a
                  href={report.evidenceUrl}
                  className="text-sky-800 underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Evidence
                </a>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One line on Today. Opening the case is the line itself when there is one. */
export function AccessNeededLines({ lines }: { lines: AccessNeededLine[] }) {
  if (lines.length === 0) return null;
  return (
    <ul className="space-y-2" aria-label="Access needed">
      {lines.map((item) => {
        const className =
          "block min-w-0 break-words rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-slate-900";
        return (
          <li key={item.id}>
            {item.missionId ? (
              <Link href={`/missions/${item.missionId}`} className={className}>
                {item.line}
              </Link>
            ) : (
              <p className={className}>{item.line}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
