import { PageHeader } from "@/components/common/page-header";
import { WorkersTable } from "@/components/modules/simple-table";
import { WorkersFilterForm } from "@/components/modules/workers-filter";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import {
  searchAndFilterWorkers,
  rowToWorker,
  getWorkerRoles,
  getWorkerSkills,
  getWorkerCountries,
} from "@/lib/data/workers";

export default async function WorkersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session?.organizationId) {
    return (
      <PageHeader
        title="Workers"
        description="Workers not available - organization context required"
      />
    );
  }

  const params = await searchParams;
  const search = params.search ? String(params.search) : "";
  const role = params.role ? String(params.role) : "";
  const availability = params.availability ? String(params.availability) : "";
  const country = params.country ? String(params.country) : "";
  const skill = params.skill ? String(params.skill) : "";

  const [workerRows, roles, skills, countries] = await Promise.all([
    searchAndFilterWorkers(session.organizationId, {
      search: search || undefined,
      role: role || undefined,
      availability: availability || undefined,
      country: country || undefined,
      skill: skill || undefined,
    }),
    getWorkerRoles(session.organizationId),
    getWorkerSkills(session.organizationId),
    getWorkerCountries(session.organizationId),
  ]);

  const workers = workerRows.map(rowToWorker);

  return (
    <>
      <PageHeader
        title="Workers"
        description={`${workers.length} worker${workers.length !== 1 ? "s" : ""} - availability and capability tracking for delivery planning.`}
        actions={<Button variant="primary">Add worker</Button>}
      />
      <WorkersFilterForm
        roles={roles}
        skills={skills}
        countries={countries}
        initialSearch={search}
        initialRole={role}
        initialAvailability={availability}
        initialCountry={country}
        initialSkill={skill}
      />
      <WorkersTable workers={workers} />
    </>
  );
}
