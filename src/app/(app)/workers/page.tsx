import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { WorkerCards } from "@/components/modules/worker-cards";
import { WorkersFilterForm } from "@/components/modules/workers-filter";
import { AskHanna } from "@/components/modules/ask-hanna";
import { PartnerFirms } from "@/components/modules/partner-firms";
import { ComplianceOverview } from "@/components/modules/compliance-overview";
import { getSession } from "@/lib/auth/session";
import { countNotesByWorker } from "@/lib/data/worker-notes";
import { listSupplyPartners } from "@/lib/data/supply-partners";
import { listCertAlerts } from "@/lib/data/worker-documents";
import {
  searchAndFilterWorkers,
  rowToWorker,
  getWorkerRoles,
  getWorkerSkills,
  getWorkerCountries,
} from "@/lib/data/workers";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Talent: people and partner firms on one tab, the documents that make them
// sellable on the other (DEV-011 folded Compliance in here, and Cert Alerts
// became the `certs=attention` filter plus the exceptions on Today).
type Tab = "people" | "compliance";

export default async function WorkersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session?.organizationId) {
    return (
      <PageHeader
        title="Talent pool"
        description="Talent pool not available - organization context required"
      />
    );
  }

  const params = await searchParams;
  const tab: Tab = params.tab === "compliance" ? "compliance" : "people";
  const search = params.search ? String(params.search) : "";
  const role = params.role ? String(params.role) : "";
  const availability = params.availability ? String(params.availability) : "";
  const country = params.country ? String(params.country) : "";
  const skill = params.skill ? String(params.skill) : "";
  const certs = params.certs === "attention" ? "attention" : "";

  const header = (
    <PageHeader
      // The sidebar has called this Talent for a while and the page called
      // itself Workers. Now that the pool holds firms as well as people,
      // "Workers" is not just inconsistent — it is wrong.
      title="Talent pool"
      description="Who you can put on a job — your own people and your partner firms — what they can do, and when they are free."
      actions={
        <div className="flex items-center gap-2">
          <Link
            href="/imports"
            className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 transition hover:bg-slate-50"
          >
            Import from CSV
          </Link>
        </div>
      }
    />
  );

  const tabs = (
    <div className="mb-4 inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white">
      {(
        [
          { key: "people", label: "People & firms", href: "/workers" },
          { key: "compliance", label: "Compliance", href: "/workers?tab=compliance" },
        ] as const
      ).map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={tab === t.key ? "page" : undefined}
          className={cn(
            "h-9 px-3.5 text-sm font-medium leading-9 transition",
            tab === t.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );

  if (tab === "compliance") {
    return (
      <>
        {header}
        {tabs}
        <ComplianceOverview
          orgId={session.organizationId}
          role={session.role}
          initialChecklistItemId={
            typeof params.checklist === "string" ? params.checklist : undefined
          }
        />
      </>
    );
  }

  const [workerRows, allRows, roles, skills, countries, partners, certAlerts] =
    await Promise.all([
      searchAndFilterWorkers(session.organizationId, {
        search: search || undefined,
        role: role || undefined,
        availability: availability || undefined,
        country: country || undefined,
        skill: skill || undefined,
      }),
      searchAndFilterWorkers(session.organizationId, {}),
      getWorkerRoles(session.organizationId),
      getWorkerSkills(session.organizationId),
      getWorkerCountries(session.organizationId),
      listSupplyPartners(session.organizationId),
      certs ? listCertAlerts(session.organizationId) : Promise.resolve([]),
    ]);

  // "Whose certificates need attention" is a filter on the pool, not a page
  // of its own. Expired or expiring within 30 days, same rule as Today.
  const certAttention = new Set(
    certAlerts
      .filter((c) => c.expiryStatus === "expired" || c.expiryStatus === "expiring_soon")
      .map((c) => c.workerId),
  );
  const workers = workerRows
    .map(rowToWorker)
    .filter((w) => !certs || certAttention.has(w.id));

  // Who already has history recorded — a card showing "3 notes" is the cue
  // that there is something to read before putting this person forward.
  const noteCounts = Object.fromEntries(
    await countNotesByWorker(
      workers.map((w) => w.id),
      session.organizationId,
    ),
  );

  return (
    <>
      {header}
      {tabs}
      <AskHanna
        poolSize={allRows.length}
        partnerCount={partners.filter((p) => p.sellable).length}
      />
      <WorkersFilterForm
        roles={roles}
        skills={skills}
        countries={countries}
        initialSearch={search}
        initialRole={role}
        initialAvailability={availability}
        resultCount={workers.length}
        totalCount={allRows.length}
        initialCountry={country}
        initialSkill={skill}
        initialCerts={certs}
      />
      <WorkerCards workers={workers} noteCounts={noteCounts} />
      {/* The other half of the pool. Two people on the bench cannot staff a
          crew of eight; a partner firm that already employs eight can. */}
      <PartnerFirms partners={partners} />
    </>
  );
}
