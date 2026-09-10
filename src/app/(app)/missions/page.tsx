import { requireSession, capabilities } from "@/lib/auth/session";
import { listClosedMissions, listMissionTabs } from "@/lib/data/missions";
import { MissionsIndex } from "@/components/missions/missions-index";

export const dynamic = "force-dynamic";

export default async function MissionsPage() {
  const session = await requireSession();
  const [tabs, closed] = await Promise.all([
    listMissionTabs(session.organizationId),
    listClosedMissions(session.organizationId),
  ]);
  return (
    <MissionsIndex
      tabs={tabs}
      closed={closed}
      canWrite={capabilities(session.role).canWrite}
    />
  );
}
