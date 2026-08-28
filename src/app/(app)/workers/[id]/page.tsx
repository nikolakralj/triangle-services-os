import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { getWorkerById } from "@/lib/data/workers";
import { listWorkerNotes } from "@/lib/data/worker-notes";
import { WorkerProfile } from "@/components/modules/worker-profile";

export const dynamic = "force-dynamic";

// One page per person: what they can do, whether they can travel, what they
// cost — and the running record of what the company has learned about them,
// which is the part that used to live in one overwritable text box.
export default async function WorkerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const row = await getWorkerById(id);

  if (!row || row.organization_id !== session.organizationId) notFound();

  const notes = await listWorkerNotes(id, session.organizationId);

  return (
    <div className="space-y-4">
      <Link
        href="/workers"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Talent Pool
      </Link>

      <WorkerProfile
        worker={{
          id: row.id,
          fullName: row.full_name,
          role: row.role ?? null,
          workerType: row.worker_type ?? null,
          email: row.email ?? null,
          phone: row.phone ?? null,
          country: row.country ?? null,
          city: row.city ?? null,
          languages: row.languages ?? [],
          skills: row.skills ?? [],
          certificates: row.certificates ?? [],
          industries: row.industries ?? [],
          preferredCountries: row.preferred_countries ?? [],
          availabilityStatus: row.availability_status ?? "unknown",
          availableFrom: row.available_from ?? null,
          hourlyRate: row.hourly_rate_expectation ?? null,
          dailyRate: row.daily_rate_expectation ?? null,
          currency: row.currency ?? "EUR",
          reliabilityScore: row.reliability_score ?? null,
          qualityScore: row.quality_score ?? null,
          safetyScore: row.safety_score ?? null,
          hasPassport: row.has_passport ?? null,
          hasA1Possible: row.has_a1_possible ?? null,
          hasOwnTools: row.has_own_tools ?? null,
          hasCar: row.has_car ?? null,
          legacyNotes: row.notes ?? null,
          status: row.status ?? "active",
        }}
        initialNotes={notes}
      />
    </div>
  );
}
