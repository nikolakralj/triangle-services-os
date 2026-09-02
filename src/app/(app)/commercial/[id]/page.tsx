import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { BuyerRouteForm } from "@/components/modules/buyer-route-form";
import { CommercialActionForm } from "@/components/modules/commercial-action-form";
import { CommercialRequirementEditor } from "@/components/modules/commercial-requirement-editor";
import {
  BuyerRouteEditor,
  CommercialActionEditor,
} from "@/components/modules/commercial-record-editors";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EntityCasePanel } from "@/components/modules/entity-case-panel";
import { getSession } from "@/lib/auth/session";
import {
  getEntityEvidenceBatch,
  getRequirementResearchCase,
} from "@/lib/data/company-case";
import { getCommercialWorkspace } from "@/lib/data/commercial";

export const dynamic = "force-dynamic";

function intent(status: string) {
  if (["qualified", "proposal_ready", "ordered", "confirmed", "approved", "completed", "responded"].includes(status)) {
    return "success" as const;
  }
  if (["disqualified", "closed", "blocked", "rejected", "cancelled"].includes(status)) {
    return "danger" as const;
  }
  return "warning" as const;
}

export default async function CommercialRequirementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session?.organizationId) notFound();
  const { id } = await params;
  const workspace = await getCommercialWorkspace(id, session.organizationId);
  if (!workspace) notFound();

  // The research behind this requirement. A requirement is created by a human,
  // so it has no proposal of its own — its case is whatever employee work was
  // attached to it, plus the case of the project it came from. Showing the
  // evidence next to the route matters because this page is where someone
  // decides whether to pick up the phone.
  const [researchCase, routeContactEvidence] = await Promise.all([
    getRequirementResearchCase(
      id,
      workspace.requirement.discovered_project_id,
      session.organizationId,
    ),
    getEntityEvidenceBatch(
      "buyer_contact",
      workspace.routes
        .map((r) => r.buyer_contact_id)
        .filter((v): v is string => Boolean(v)),
      session.organizationId,
    ),
  ]);

  const canEdit = session.role !== "viewer";
  const canConfirm = session.role === "admin" || session.role === "partner";
  const { requirement } = workspace;
  const sourceHref = requirement.job_lead_id
    ? "/job-intake"
    : requirement.discovered_project_id
      ? `/hunter/${requirement.discovered_project_id}`
      : requirement.opportunity_id
        ? `/opportunities/${requirement.opportunity_id}`
        : null;

  return (
    <>
      <PageHeader
        title={requirement.title}
        description="Buyer-confirmed demand, route, package, unknowns, economics, and actual human actions in one record."
        actions={
          <>
            <Link className="text-sm font-medium text-sky-700 hover:underline" href="/commercial">All requirements</Link>
            {sourceHref ? <Link className="text-sm font-medium text-sky-700 hover:underline" href={sourceHref}>Open source</Link> : null}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Badge intent={intent(requirement.status)}>{requirement.status}</Badge>
        <Badge>{requirement.source_type}</Badge>
        <Badge intent={requirement.buyer_confirmed_at ? "success" : "warning"}>
          {requirement.buyer_confirmed_at ? "buyer demand confirmed" : "buyer confirmation missing"}
        </Badge>
        <Badge intent={workspace.missingForQualification.length === 0 ? "success" : "warning"}>
          {workspace.missingForQualification.length} qualification gaps
        </Badge>
      </div>

      <Card className="mb-4">
        <CardHeader
          title="Qualified requirement"
          description="The database refuses qualified/proposal/order states until the required truth and a confirmed route exist."
        />
        <CardContent>
          {canEdit ? (
            <CommercialRequirementEditor
              requirement={requirement}
              packages={workspace.packages}
              missingForQualification={workspace.missingForQualification}
              canDecide={canConfirm}
            />
          ) : (
            <div className="space-y-2 text-sm text-slate-700">
              <p><strong>Scope:</strong> {requirement.scope_summary ?? "Unknown"}</p>
              <p><strong>Roles:</strong> {requirement.roles.join(", ") || "Unknown"}</p>
              <p><strong>Next action:</strong> {requirement.next_action ?? "Not set"}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mb-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Buyer / supplier routes"
            description="Who can buy, contract, introduce, onboard, or approve the work."
            action={
              canEdit ? (
                <BuyerRouteForm
                  requirementId={requirement.id}
                  chainNodes={workspace.chainNodes}
                  buyerContacts={workspace.buyerContacts}
                  canConfirm={canConfirm}
                />
              ) : null
            }
          />
          <div className="divide-y divide-slate-100">
            {workspace.routes.map((route) => (
              <div key={route.id} className="p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-slate-900">
                    {route.buyer_company || route.contracting_entity || route.buyer_contact_name || route.route_type}
                  </p>
                  <Badge intent={intent(route.route_status)}>{route.route_status}</Badge>
                  <Badge>{route.route_type}</Badge>
                </div>
                <p className="mt-2 text-slate-600">{route.evidence_summary || "No evidence summary recorded."}</p>
                {(routeContactEvidence.get(route.buyer_contact_id ?? "") ?? []).map((e) => (
                  <div key={e.id} className="mt-2 border-l-2 border-slate-200 pl-2.5">
                    {e.evidenceText ? (
                      <p className="line-clamp-2 text-xs leading-relaxed text-slate-500">
                        &ldquo;{e.evidenceText}&rdquo;
                      </p>
                    ) : null}
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
                      {e.foundBy ? (
                        <span>
                          {e.foundBy.emoji} Found by {e.foundBy.name}
                        </span>
                      ) : null}
                      {e.confidence !== null ? <span>{e.confidence}% sure</span> : null}
                      {e.sourceUrl ? (
                        <a
                          href={e.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-sky-700 hover:text-sky-900"
                        >
                          Source
                        </a>
                      ) : null}
                    </p>
                  </div>
                ))}
                <p className="mt-2 text-xs text-slate-500">
                  Next: {route.next_action || "not set"} · {route.next_action_due_at ? new Date(route.next_action_due_at).toLocaleString() : "no due date"}
                </p>
                {canEdit ? <BuyerRouteEditor route={route} canConfirm={canConfirm} /> : null}
              </div>
            ))}
            {workspace.routes.length === 0 ? <p className="p-4 text-sm text-slate-500">No route recorded. The requirement cannot become qualified.</p> : null}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Commercial action ledger"
            description="Draft and final content stay separate; completed means a human confirms the action really happened."
            action={canEdit ? <CommercialActionForm requirementId={requirement.id} routes={workspace.routes} packages={workspace.packages} canConfirm={canConfirm} /> : null}
          />
          <div className="divide-y divide-slate-100">
            {workspace.actions.map((action) => (
              <div key={action.id} className="p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-slate-900">{action.subject || action.action_type}</p>
                  <Badge intent={intent(action.status)}>{action.status}</Badge>
                  <Badge>{action.channel || action.action_type}</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  To {action.recipient_name || action.recipient_email || action.recipient_company || "internal"} · {action.occurred_at ? new Date(action.occurred_at).toLocaleString() : "not performed"}
                </p>
                {action.final_content ? <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-slate-600">{action.final_content}</p> : null}
                <p className="mt-2 text-xs text-slate-500">
                  Follow-up: {action.follow_up_at ? new Date(action.follow_up_at).toLocaleString() : "not set"}
                </p>
                {canEdit ? <CommercialActionEditor action={action} canConfirm={canConfirm} /> : null}
              </div>
            ))}
            {workspace.actions.length === 0 ? <p className="p-4 text-sm text-slate-500">No action recorded. A generated draft is not a sent action.</p> : null}
          </div>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader
          title="Research case"
          description={
            researchCase.inherited
              ? "Inherited from the project this requirement came from — the evidence that says this demand is real."
              : "Employee work attached to this requirement."
          }
        />
        <CardContent>
          <EntityCasePanel
            snapshot={researchCase.snapshot}
            emptyHint="No research behind this requirement yet. Put an employee on the project it came from, or record the evidence that says the demand is real."
          />
        </CardContent>
      </Card>

      <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        This workspace records commercial truth; it does not send messages, accept supplier terms, sign agreements, or share personal documents automatically.
      </p>
    </>
  );
}
