import { requireSession, capabilities } from "@/lib/auth/session";
import { listClosedMissions, listMissionTabs } from "@/lib/data/missions";
import { MissionsIndex } from "@/components/missions/missions-index";

export const dynamic = "force-dynamic";

export default async function MissionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const [tabs, closed] = await Promise.all([
    listMissionTabs(session.organizationId),
    listClosedMissions(session.organizationId),
  ]);
  return (
    <MissionsIndex
      tabs={tabs}
      closed={closed}
      canWrite={capabilities(session.role).canWrite}
      notice={
        params.notice === "companies"
          ? "Company records stay on missions, Approvals and holdings. There is no company directory to browse."
          : null
      }
    />
  );
}
