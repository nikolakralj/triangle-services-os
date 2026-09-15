import { notFound } from "next/navigation";
import { requireSession, capabilities } from "@/lib/auth/session";
import { getMissionWorkspace } from "@/lib/data/missions";
import { parseMissionSurfaceTab } from "@/lib/data/mission-shared";
import { MissionView } from "@/components/missions/mission-view";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MissionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const session = await requireSession();
  const workspace = await getMissionWorkspace(session.organizationId, id);
  if (!workspace) notFound();

  const caps = capabilities(session.role);
  // A role that cannot see Triangle's people on the Talent Pool page does not
  // see them through a recruiting mission either.
  const visible = caps.canSeeWorkers ? workspace : { ...workspace, candidates: [], partners: [] };
  const sp = await searchParams;
  const tabRaw = sp.tab;
  const initialTab = parseMissionSurfaceTab(
    typeof tabRaw === "string" ? tabRaw : Array.isArray(tabRaw) ? tabRaw[0] : null,
  );

  return (
    <MissionView
      workspace={visible}
      canWrite={caps.canWrite}
      canSeeWorkers={caps.canSeeWorkers}
      initialTab={initialTab}
    />
  );
}
