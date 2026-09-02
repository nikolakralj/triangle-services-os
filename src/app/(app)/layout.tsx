import { AuthGate } from "@/components/auth/auth-gate";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { AgentWorkPulse } from "@/components/modules/agent-work-pulse";
import { getSession } from "@/lib/auth/session";
import { countDecisionAttention } from "@/lib/data/decision-inbox";
import {
  DEMO_ORGANIZATION_PROFILE,
  getOrganizationOperatingProfile,
} from "@/lib/data/organization-profile";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // getSession() is safe to call here — returns null in demo mode (no Supabase).
  const session = await getSession();

  // Carried in the chrome so proposals waiting on a human are visible from
  // every page, not only from the one project they were filed against.
  const [approvalsCount, organizationProfile] = session?.organizationId
    ? await Promise.all([
        countDecisionAttention(session.organizationId),
        getOrganizationOperatingProfile(session.organizationId),
      ])
    : [0, DEMO_ORGANIZATION_PROFILE];

  return (
    <AuthGate>
      {session?.organizationId ? <AgentWorkPulse /> : null}
      <div className="flex min-h-screen bg-slate-50">
        <Sidebar approvalsCount={approvalsCount} />
        <div className="min-w-0 flex-1">
          <Topbar
            displayName={session?.email ?? ""}
            role={session?.role ?? ""}
            organizationName={organizationProfile?.name ?? ""}
          />
          <main className="mx-auto max-w-[1760px] px-4 py-4 xl:px-5">
            {children}
          </main>
        </div>
      </div>
    </AuthGate>
  );
}
