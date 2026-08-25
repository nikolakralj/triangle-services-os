import { requireApiAccess } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { listJobLeads, type LeadSort } from "@/lib/data/job-intake";

// ---------------------------------------------------------------------------
// GET /api/job-intake/export?status=
// Download the lead list as CSV (opens directly in Excel).
// ---------------------------------------------------------------------------

const COLUMNS: Array<[string, (l: Awaited<ReturnType<typeof listJobLeads>>[number]) => string]> = [
  ["Received",    (l) => (l.receivedAt ? new Date(l.receivedAt).toISOString().slice(0, 10) : "")],
  ["Agency",      (l) => l.agencyName ?? ""],
  ["Contact",     (l) => l.contactName ?? ""],
  ["Contact email", (l) => l.contactEmail ?? ""],
  ["Client",      (l) => l.clientCompany ?? ""],
  ["Role",        (l) => l.roleTitle],
  ["Country",     (l) => l.country ?? ""],
  ["City",        (l) => l.city ?? ""],
  ["Sector",      (l) => l.sector ?? ""],
  ["Technology",  (l) => l.technologies.join("; ")],
  ["Duration (months)", (l) => (l.durationMonths ? String(l.durationMonths) : "")],
  ["Start",       (l) => l.startDateText ?? ""],
  ["Rate",        (l) => l.rateText ?? ""],
  ["Headcount",   (l) => l.headcountText ?? ""],
  ["Work mode",   (l) => l.workMode ?? ""],
  ["Team score",  (l) => (l.teamPotential === null ? "" : String(l.teamPotential))],
  ["Why",         (l) => l.teamRationale ?? ""],
  ["Docs requested", (l) => l.requestedDocuments.join("; ")],
  ["Ask for",     (l) => l.missingFields.join("; ")],
  ["Status",      (l) => l.status],
  ["Subject",     (l) => l.subject ?? ""],
];

/**
 * RFC-4180 escaping. The leading-character guard stops Excel interpreting
 * a value like "=cmd" or "+1..." as a formula.
 */
function csvCell(value: string): string {
  const unsafeLead = /^[=+\-@\t\r]/.test(value);
  const v = unsafeLead ? `'${value}` : value;
  return `"${v.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const status = statusParam && statusParam !== "all" ? statusParam : undefined;
  const sortParam = url.searchParams.get("sort");
  const sort: LeadSort =
    sortParam === "newest" || sortParam === "oldest" ? sortParam : "score";

  if (access.demo) {
    return NextResponse.json(
      { error: "Export is not available in demo mode." },
      { status: 403 },
    );
  }

  const leads = await listJobLeads(access.organizationId, {
    status,
    sort,
    limit: 1000,
  });

  const lines = [
    COLUMNS.map(([header]) => csvCell(header)).join(","),
    ...leads.map((lead) =>
      COLUMNS.map(([, get]) => csvCell(get(lead))).join(","),
    ),
  ];

  // BOM so Excel opens UTF-8 (accented names, €) correctly.
  const csv = "﻿" + lines.join("\r\n");
  const date = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="triangle-job-intake-${date}.csv"`,
    },
  });
}
