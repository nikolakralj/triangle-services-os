import { notFound } from "next/navigation";
import { requireSession, capabilities } from "@/lib/auth/session";
import { getMissionWorkspace } from "@/lib/data/missions";
import { MissionView } from "@/components/missions/mission-view";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
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

  return (
    <MissionView
      workspace={visible}
      canWrite={caps.canWrite}
      canSeeWorkers={caps.canSeeWorkers}
    />
  );
}
