import Link from "next/link";
import {
  AlertCircle,
  FileDown,
  Inbox,
  Mail,
  ShieldCheck,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { getSession } from "@/lib/auth/session";
import { JobIntakeSyncButton } from "@/components/modules/job-intake-sync-button";
import { LeadReplyPanel } from "@/components/modules/lead-reply-panel";
import {
  getIntakeCounts,
  listJobLeads,
  listReplyDrafts,
  type JobLead,
  type LeadReplyDraft,
  type LeadSort,
} from "@/lib/data/job-intake";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const MISSING_LABEL: Record<string, string> = {
  headcount: "Headcount",
  rate: "Rate",
  location: "Location",
  start_date: "Start date",
  duration: "Duration",
};

const DOC_LABEL: Record<string, string> = {
  cv: "CV",
  phone: "Phone",
  references: "References",
  certificates: "Certificates",
};

export default async function JobIntakePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; sort?: string }>;
}) {
  const session = await getSession();
  if (!session?.organizationId) {
    return (
      <PageHeader
        title="Job Intake"
        description="Job Intake not available — organization context required."
      />
    );
  }

  const query = await searchParams;
  const status = query.status && query.status !== "all" ? query.status : undefined;
  const sort: LeadSort =
    query.sort === "newest" || query.sort === "oldest" ? query.sort : "score";

  /** Keep the other filter intact when changing one of them. */
  const linkTo = (next: { status?: string; sort?: string }) => {
    const params = new URLSearchParams();
    const s = next.status ?? query.status;
    const o = next.sort ?? query.sort;
    if (s && s !== "all") params.set("status", s);
    if (o && o !== "score") params.set("sort", o);
    const qs = params.toString();
    return qs ? `/job-intake?${qs}` : "/job-intake";
  };

  // The CSV should match whatever the user is currently looking at.
  const exportParams = new URLSearchParams();
  if (status) exportParams.set("status", status);
  if (sort !== "score") exportParams.set("sort", sort);
  const exportHref = `/api/job-intake/export${
    exportParams.toString() ? `?${exportParams}` : ""
  }`;

  const [counts, leads] = await Promise.all([
    getIntakeCounts(session.organizationId),
    listJobLeads(session.organizationId, { status, sort }),
  ]);

  // Attribution only earns screen space once a second person is feeding the
  // pipeline — with one mailbox, "via nikola@…" on every card is just noise.
  const sourceMailboxCount = new Set(
    leads.map((l) => l.sourceMailbox).filter(Boolean),
  ).size;

  // Newest draft per lead, so each card can show its reply inline.
  const draftLists = await Promise.all(
    leads.map((l) => listReplyDrafts(l.id, session.organizationId)),
  );
  const draftByLead = new Map(
    leads.map((l, i) => [l.id, draftLists[i][0] ?? null]),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Job Intake"
        description="Agency emails, read automatically and turned into scored opportunities. Nothing is ever sent without you clicking send."
      />

      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Users}
          value={counts.highPotential}
          label="Crew opportunities"
          hint="Score 70+ — worth a team, not one person"
          tone="emerald"
        />
        <StatCard
          icon={Inbox}
          value={counts.newLeads}
          label="Waiting for review"
          hint="New, not yet actioned"
          tone="sky"
        />
        <StatCard
          icon={Mail}
          value={counts.emailsProcessed}
          label="Emails read"
          hint={`${counts.noiseRejected} noise rejected`}
          tone="slate"
        />
        <StatCard
          icon={ShieldCheck}
          value={counts.duplicates}
          label="Duplicates caught"
          hint="Same role sent twice"
          tone="slate"
        />
      </div>

      {/* Filters + export */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {[
            { key: "all", label: "All" },
            { key: "new", label: "New" },
            { key: "reviewing", label: "Reviewing" },
            { key: "replied", label: "Replied" },
            { key: "qualified", label: "Qualified" },
            { key: "rejected", label: "Rejected" },
          ].map(({ key, label }) => {
            const active = (query.status ?? "all") === key;
            return (
              <Link
                key={key}
                href={linkTo({ status: key })}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition",
                  active
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                )}
              >
                {label}
              </Link>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-white p-0.5">
            {[
              { key: "score", label: "Best first" },
              { key: "newest", label: "Newest" },
              { key: "oldest", label: "Oldest" },
            ].map(({ key, label }) => (
              <Link
                key={key}
                href={linkTo({ sort: key })}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium transition",
                  sort === key
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100",
                )}
              >
                {label}
              </Link>
            ))}
          </div>
          <JobIntakeSyncButton />
          {leads.length > 0 && (
            <a
              href={exportHref}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <FileDown className="h-3.5 w-3.5" />
              Export CSV
            </a>
          )}
        </div>
      </div>

      {leads.length === 0 ? <EmptyState hasMail={counts.emailsProcessed > 0} /> : (
        <div className="space-y-3">
          {leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              draft={draftByLead.get(lead.id) ?? null}
              showSource={sourceMailboxCount > 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function StatCard({
  icon: Icon,
  value,
  label,
  hint,
  tone,
}: {
  icon: typeof Users;
  value: number;
  label: string;
  hint: string;
  tone: "emerald" | "sky" | "slate";
}) {
  const tones = {
    emerald: "text-emerald-600 bg-emerald-50",
    sky: "text-sky-600 bg-sky-50",
    slate: "text-slate-500 bg-slate-100",
  }[tone];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
          <p className="mt-0.5 text-sm font-medium text-slate-700">{label}</p>
          <p className="mt-1 text-xs text-slate-500">{hint}</p>
        </div>
        <span className={cn("shrink-0 rounded-lg p-2", tones)}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

function scoreTone(score: number | null) {
  if (score === null) return { text: "text-slate-500", bg: "bg-slate-100" };
  if (score >= 70) return { text: "text-emerald-700", bg: "bg-emerald-50" };
  if (score >= 45) return { text: "text-amber-700", bg: "bg-amber-50" };
  return { text: "text-slate-600", bg: "bg-slate-100" };
}

function LeadCard({
  lead,
  draft,
  showSource,
}: {
  lead: JobLead;
  draft: LeadReplyDraft | null;
  /** Only worth showing once leads arrive from more than one mailbox. */
  showSource: boolean;
}) {
  const tone = scoreTone(lead.teamPotential);

  const facts: Array<[string, string | null]> = [
    ["Country", lead.city ? `${lead.city}, ${lead.country ?? ""}`.replace(/, $/, "") : lead.country],
    ["Duration", lead.durationMonths ? `${lead.durationMonths} months` : null],
    ["Start", lead.startDateText],
    ["Rate", lead.rateText],
    ["Headcount", lead.headcountText],
    ["Sector", lead.sector],
  ];

  return (
    <article className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-slate-950">{lead.roleTitle}</h3>
          <p className="mt-0.5 text-sm text-slate-500">
            {lead.contactName ?? "Unknown contact"}
            {lead.agencyName ? ` · ${lead.agencyName}` : ""}
            {lead.receivedAt
              ? ` · ${new Date(lead.receivedAt).toLocaleDateString()}`
              : ""}
            {showSource && lead.sourceMailbox ? (
              <span className="text-slate-400"> · via {lead.sourceMailbox}</span>
            ) : null}
          </p>
          {lead.technologies.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {lead.technologies.map((t) => (
                <span
                  key={t}
                  className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className={cn("shrink-0 rounded-lg px-3 py-2 text-center", tone.bg)}>
          <p className={cn("text-xl font-semibold tabular-nums", tone.text)}>
            {lead.teamPotential ?? "—"}
          </p>
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Team score
          </p>
        </div>
      </div>

      {facts.some(([, v]) => v) && (
        <div className="grid grid-cols-2 gap-px border-t border-slate-100 bg-slate-100 sm:grid-cols-3 lg:grid-cols-6">
          {facts.map(([k, v]) => (
            <div key={k} className="bg-white px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {k}
              </p>
              <p
                className={cn(
                  "mt-0.5 text-xs",
                  v ? "text-slate-800" : "italic text-slate-400",
                )}
              >
                {v ?? "not stated"}
              </p>
            </div>
          ))}
        </div>
      )}

      {(lead.teamRationale ||
        lead.missingFields.length > 0 ||
        lead.requestedDocuments.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
          {lead.teamRationale && (
            <p className="min-w-0 flex-1 text-xs text-slate-600">{lead.teamRationale}</p>
          )}
          {lead.requestedDocuments.map((d) => (
            <Badge key={d} intent="warning">
              {DOC_LABEL[d] ?? d} requested
            </Badge>
          ))}
          {lead.missingFields.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">
              <AlertCircle className="h-3 w-3 shrink-0" />
              Ask for: {lead.missingFields.map((f) => MISSING_LABEL[f] ?? f).join(", ")}
            </span>
          )}
        </div>
      )}

      <div className="space-y-3 border-t border-slate-100 px-4 py-3">
        {lead.emailBody ? (
          <details className="group rounded-lg border border-slate-200 bg-slate-50/60">
            <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-slate-700 marker:hidden">
              <span className="inline-flex items-center gap-1.5">
                Original email
                <span className="text-slate-400 group-open:hidden">show</span>
                <span className="hidden text-slate-400 group-open:inline">hide</span>
              </span>
            </summary>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap border-t border-slate-200 bg-white px-3 py-2 font-sans text-xs leading-relaxed text-slate-700">
              {lead.emailBody}
            </pre>
          </details>
        ) : null}
        <LeadReplyPanel
          leadId={lead.id}
          contactName={lead.contactName}
          existingDraft={draft}
        />
      </div>
    </article>
  );
}

function EmptyState({ hasMail }: { hasMail: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <Inbox className="mx-auto h-8 w-8 text-slate-400" />
      <h3 className="mt-3 text-base font-semibold text-slate-800">
        {hasMail ? "No opportunities in this view" : "No mailbox connected yet"}
      </h3>
      {hasMail ? (
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
          Emails have been read, but none matched this filter. Try “All”.
        </p>
      ) : (
        <div className="mx-auto mt-3 max-w-lg space-y-3 text-left">
          <p className="text-sm text-slate-600">
            To start collecting, connect a mailbox. Each person does this for their
            own account and can switch it off at any time:
          </p>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-600">
            <li>Turn on 2-step verification in your Google account.</li>
            <li>
              Create an <strong>app password</strong> for Triangle OS (Google
              Account → Security → App passwords).
            </li>
            <li>
              Add it to <code className="rounded bg-slate-200 px-1 text-xs">.env.local</code>{" "}
              and register the mailbox in Settings.
            </li>
          </ol>
          <p className="text-xs text-slate-500">
            Mail that isn’t an agency opportunity is classified and discarded — the
            body is never stored.
          </p>
        </div>
      )}
    </div>
  );
}
