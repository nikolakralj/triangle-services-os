import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { WorkerCards } from "@/components/modules/worker-cards";
import { WorkersFilterForm } from "@/components/modules/workers-filter";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { countNotesByWorker } from "@/lib/data/worker-notes";
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

  const [workerRows, allRows, roles, skills, countries] = await Promise.all([
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
  ]);

  const workers = workerRows.map(rowToWorker);

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
      <PageHeader
        title="Workers"
        description="Who you can put on a job, what they can do, and when they are free."
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/imports"
              className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 transition hover:bg-slate-50"
            >
              Import from CSV
            </Link>
            <Button variant="primary">Add worker</Button>
          </div>
        }
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
      />
      <WorkerCards workers={workers} noteCounts={noteCounts} />
    </>
  );
}
