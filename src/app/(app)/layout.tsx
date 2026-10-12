import { AuthGate } from "@/components/auth/auth-gate";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { AgentWorkPulse } from "@/components/modules/agent-work-pulse";
import { getSession } from "@/lib/auth/session";
import { countDecisions } from "@/lib/data/came-back";
import { countMissionsForYou } from "@/lib/data/missions";
import { listOpenClientTabs } from "@/lib/data/client-tabs";
import { ClientTabStrip } from "@/components/layout/client-tab-strip";
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

  // Carried in the chrome so decisions waiting on a human are visible from
  // every page. Counts only findings the contract can describe: the previous
  // count included every pending proposal ever filed, so the badge read 52
  // while the screen it links to said "nothing to decide".
  //
  // Missions are counted the way their tabs are drawn — asked something,
  // finished since you looked, or stopped — so the badge and the strip it
  // leads to cannot disagree.
  // Pinned client tabs (2026-10-12) draw as a strip under the top bar, not
  // as a menu item: the shell stays Today / Missions / Talent / Team.
  const [approvalsCount, organizationProfile, missionsCount, clientTabs] = session?.organizationId
    ? await Promise.all([
        countDecisions(session.organizationId),
        getOrganizationOperatingProfile(session.organizationId),
        countMissionsForYou(session.organizationId),
        listOpenClientTabs(session.organizationId),
      ])
    : ([0, DEMO_ORGANIZATION_PROFILE, 0, []] as const);

  return (
    <AuthGate>
      {session?.organizationId ? <AgentWorkPulse /> : null}
      <div className="flex min-h-screen bg-slate-50">
        <Sidebar approvalsCount={approvalsCount} missionsCount={missionsCount} />
        <div className="min-w-0 flex-1">
          <Topbar
            displayName={session?.email ?? ""}
            role={session?.role ?? ""}
            organizationName={organizationProfile?.name ?? ""}
          />
          <ClientTabStrip
            tabs={clientTabs.map((tab) => ({
              id: tab.id,
              key: tab.companyId ?? tab.companyName,
              name: tab.companyName,
              quiet: tab.quiet,
            }))}
          />
          <main className="mx-auto max-w-[1760px] px-4 py-4 xl:px-5">
            {children}
          </main>
        </div>
      </div>
    </AuthGate>
  );
}
