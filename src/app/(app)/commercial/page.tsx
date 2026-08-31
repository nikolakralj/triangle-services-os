import Link from "next/link";
import { AlertTriangle, CalendarClock, Route, Send } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { CommercialRequirementCreate } from "@/components/modules/commercial-requirement-create";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import {
  listCommercialRequirements,
  listCommercialSourceOptions,
} from "@/lib/data/commercial";
import {
  DEMO_ORGANIZATION_PROFILE,
  getOrganizationOperatingProfile,
} from "@/lib/data/organization-profile";

export const dynamic = "force-dynamic";

function statusIntent(status: string) {
  if (["qualified", "proposal_ready", "ordered"].includes(status)) {
    return "success" as const;
  }
  if (["disqualified", "closed"].includes(status)) return "danger" as const;
  return "warning" as const;
}

export default async function CommercialPage() {
  const session = await getSession();
  if (!session?.organizationId) {
    return <PageHeader title="Commercial requirements" description="Organization context is required." />;
  }

  const [requirements, sources, profile] = await Promise.all([
    listCommercialRequirements(session.organizationId),
    listCommercialSourceOptions(session.organizationId),
    getOrganizationOperatingProfile(session.organizationId),
  ]);

  return (
    <>
      <PageHeader
        title="Commercial requirements"
        description="The common truth record where a signal, buyer route, specific package, and dated human action converge."
      />
      {session.role !== "viewer" ? (
        <div className="mb-4">
          <CommercialRequirementCreate
            sources={sources}
            defaultCurrency={
              profile?.defaultCurrency ?? DEMO_ORGANIZATION_PROFILE.defaultCurrency
            }
          />
        </div>
      ) : null}

      <div className="space-y-3">
        {requirements.map((requirement) => (
          <Link key={requirement.id} href={`/commercial/${requirement.id}`}>
            <Card className="transition hover:border-sky-300 hover:shadow-md">
              <CardContent className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-slate-950">{requirement.title}</h2>
                    <Badge intent={statusIntent(requirement.status)}>{requirement.status}</Badge>
                    <Badge>{requirement.source_type}</Badge>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                    {requirement.scope_summary || "Scope has not been confirmed yet."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
                    <span>{requirement.roles.length > 0 ? requirement.roles.join(", ") : "roles unknown"}</span>
                    <span>
                      {requirement.headcount_min || requirement.headcount_max
                        ? `${requirement.headcount_min ?? "?"}–${requirement.headcount_max ?? requirement.headcount_min ?? "?"} people`
                        : "headcount unknown"}
                    </span>
                    <span>{[requirement.city, requirement.country].filter(Boolean).join(", ") || "location unknown"}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 lg:min-w-64">
                  <span className="flex items-center gap-1"><Route className="h-3.5 w-3.5" /> {requirement.confirmedRouteCount}/{requirement.routeCount} confirmed routes</span>
                  <span className="flex items-center gap-1"><Send className="h-3.5 w-3.5" /> {requirement.completedActionCount}/{requirement.actionCount} completed actions</span>
                  <span className="flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> {requirement.missingForQualification.length} qualification gaps</span>
                  <span className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> {requirement.next_action_due_at ? new Date(requirement.next_action_due_at).toLocaleDateString() : "no due date"}</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
        {requirements.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="font-medium text-slate-800">No commercial requirements yet</p>
              <p className="mt-1 text-sm text-slate-500">
                Promote a real job lead/project or create a manual buyer-confirmed requirement. A high-scoring signal alone does not belong here as qualified.
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
