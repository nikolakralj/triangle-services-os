import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleAlert } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import {
  getTenantReadiness,
  type ReadinessPhase,
} from "@/lib/data/onboarding";

export const dynamic = "force-dynamic";

const PHASES: ReadinessPhase[] = [
  "Workspace foundation",
  "Demand intake",
  "Supply truth",
  "First commercial cycle",
];

function outcomeBadge(ready: boolean) {
  return ready ? "success" : "warning";
}

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session?.organizationId) {
    return (
      <PageHeader
        title="Setup readiness"
        description="Organization context is required."
      />
    );
  }

  const readiness = await getTenantReadiness(session.organizationId);
  const nextBlocker = readiness.items.find((item) => !item.complete);

  return (
    <>
      <PageHeader
        title="Setup readiness"
        description="A truthful checklist for the first safe intake, qualification, commercial draft, and buyer-linked package."
      />

      <Card className="mb-4 border-sky-200 bg-sky-50/50">
        <CardContent className="grid gap-4 pt-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="flex items-baseline gap-3">
              <p className="text-3xl font-semibold text-slate-950">
                {readiness.percent}%
              </p>
              <p className="text-sm text-slate-600">
                {readiness.completed} of {readiness.total} readiness gates complete
              </p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-sky-600"
                style={{ width: `${readiness.percent}%` }}
              />
            </div>
            {nextBlocker ? (
              <p className="mt-3 text-sm text-slate-700">
                Next blocker: <strong>{nextBlocker.label}</strong> — {nextBlocker.blocker}
              </p>
            ) : (
              <p className="mt-3 text-sm font-medium text-emerald-700">
                Repository readiness gates are complete. Real commercial outcomes still require human evidence.
              </p>
            )}
          </div>
          {nextBlocker ? (
            <Link
              href={nextBlocker.href}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
            >
              {nextBlocker.actionLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : null}
        </CardContent>
      </Card>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        {[
          ["Safe intake", readiness.safeIntake, "Identity, operator, source, rules"],
          ["Safe targeted draft", readiness.safeDraft, "Identity, rules, qualified demand"],
          ["Buyer-linked package", readiness.packageReady, "Supply, buyer route, specific package"],
        ].map(([label, ready, description]) => (
          <Card key={String(label)}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-slate-900">{String(label)}</p>
                <Badge intent={outcomeBadge(Boolean(ready))}>
                  {ready ? "ready" : "blocked"}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-slate-500">{String(description)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-4">
        {PHASES.map((phase) => {
          const items = readiness.items.filter((item) => item.phase === phase);
          return (
            <Card key={phase}>
              <CardHeader
                title={phase}
                description={`${items.filter((item) => item.complete).length}/${items.length} complete`}
              />
              <div className="divide-y divide-slate-100">
                {items.map((item) => (
                  <div
                    key={item.key}
                    className="grid gap-3 px-4 py-4 lg:grid-cols-[24px_1fr_auto] lg:items-start"
                  >
                    {item.complete ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
                    ) : (
                      <CircleAlert className="mt-0.5 h-5 w-5 text-amber-600" />
                    )}
                    <div>
                      <p className="font-medium text-slate-900">{item.label}</p>
                      <p className="mt-1 text-sm text-slate-600">{item.evidence}</p>
                      {!item.complete ? (
                        <p className="mt-1 text-xs text-amber-800">{item.blocker}</p>
                      ) : null}
                    </div>
                    <Link
                      href={item.href}
                      className="text-sm font-medium text-sky-700 hover:underline"
                    >
                      {item.complete ? "Review" : item.actionLabel}
                    </Link>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Readiness means the software has the records needed to support the workflow. It does not prove worker availability, buyer intent, a sent offer, a contract, or revenue; those require dated human evidence.
      </p>
    </>
  );
}
