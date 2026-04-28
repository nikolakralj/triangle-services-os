import { PageHeader } from "@/components/common/page-header";
import { CompaniesWorkspace } from "@/components/modules/companies-workspace";
import { CompaniesFilterForm } from "@/components/modules/companies-filter";
import { requireSession, capabilities } from "@/lib/auth/session";
import {
  searchAndFilterCompanies,
  rowToCompany,
  getCompanyStatuses,
  getCompanySectors,
  getCompanyCountries,
} from "@/lib/data/companies";
import { listWorkers, rowToWorker } from "@/lib/data/workers";

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  const search = params.search ? String(params.search) : "";
  const status = params.status ? String(params.status) : "";
  const sector = params.sector ? String(params.sector) : "";
  const country = params.country ? String(params.country) : "";
  const ownerId = params.ownerId ? String(params.ownerId) : "";
  const priority = params.priority ? String(params.priority) : "";

  const [rows, statuses, sectors, countries, workers] = await Promise.all([
    searchAndFilterCompanies(session.organizationId, {
      search: search || undefined,
      status: status || undefined,
      sector: sector || undefined,
      country: country || undefined,
      priority: priority || undefined,
      ownerId: ownerId || undefined,
    }),
    getCompanyStatuses(session.organizationId),
    getCompanySectors(session.organizationId),
    getCompanyCountries(session.organizationId),
    listWorkers(session.organizationId),
  ]);

  const companies = rows.map(rowToCompany);
  const workersList = workers.map(rowToWorker);
  const caps = capabilities(session.role);

  return (
    <>
      <PageHeader
        title="Companies"
        description={`${companies.length} company${companies.length !== 1 ? "ies" : ""} - filter, search, score, and convert to opportunities.`}
      />
      <CompaniesFilterForm
        statuses={statuses}
        sectors={sectors}
        countries={countries}
        workers={workersList}
        initialSearch={search}
        initialStatus={status}
        initialSector={sector}
        initialCountry={country}
        initialOwnerId={ownerId}
        initialPriority={priority}
      />
      <CompaniesWorkspace
        initialCompanies={companies}
        canWrite={caps.canWrite}
        canDelete={caps.canDelete}
      />
    </>
  );
}
