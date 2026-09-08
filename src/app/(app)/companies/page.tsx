import { PageHeader } from "@/components/common/page-header";
import { CompaniesWorkspace } from "@/components/modules/companies-workspace";
import { requireSession, capabilities } from "@/lib/auth/session";
import {
  searchAndFilterCompanies,
  rowToCompany,
  companiesWithSubstance,
} from "@/lib/data/companies";

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

  const [rows, substance] = await Promise.all([
    searchAndFilterCompanies(session.organizationId, {
      search: search || undefined,
      status: status || undefined,
      sector: sector || undefined,
      country: country || undefined,
      priority: priority || undefined,
      ownerId: ownerId || undefined,
    }),
    companiesWithSubstance(session.organizationId),
  ]);

  // Something established first, names after. Alphabetical order on a phone
  // book is not a ranking, and it buried the eight companies that matter
  // under a hundred and sixty-six that do not.
  const companies = rows
    .map(rowToCompany)
    .sort((a, b) => {
      const rank = (id: string) => (substance.has(id) ? 0 : 1);
      const byRank = rank(a.id) - rank(b.id);
      return byRank !== 0 ? byRank : a.name.localeCompare(b.name);
    });
  const known = companies.filter((c) => substance.has(c.id)).length;
  const caps = capabilities(session.role);

  return (
    <>
      <PageHeader
        title="Companies"
        description={
          known === companies.length
            ? `${companies.length} companies.`
            : `${known} of ${companies.length} companies have something established — evidence, a contact, or work done. The other ${companies.length - known} are names a researcher wrote down, listed after them.`
        }
      />
      <CompaniesWorkspace
        initialCompanies={companies}
        canWrite={caps.canWrite}
        canDelete={caps.canDelete}
      />
    </>
  );
}
