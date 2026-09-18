import { PageHeader } from "@/components/common/page-header";
import { TodayScreen } from "@/components/modules/today-screen";
import { getNextMove } from "@/lib/data/next-move";
import { listWhatCameBack } from "@/lib/data/came-back";
import { listWorkforce } from "@/lib/data/workforce";
import { listMissionTabs, listReadyToContact } from "@/lib/data/missions";
import { listFollowUpsDue } from "@/lib/data/follow-ups";
import { listAttachableWorkers, listDoneSince, listInProgressWaits } from "@/lib/data/today-in-progress";
import { listCertAlerts } from "@/lib/data/worker-documents";
import { getSession } from "@/lib/auth/session";
import { sendableMailboxesFor } from "@/lib/data/mail-send";
import { listPutForwardCases } from "@/lib/data/put-forward-cases";

// ---------------------------------------------------------------------------
// The one screen.
//
// This page used to load the decision inbox, the plays, the workforce, every
// assignment, the agent faces and four table counts, and hand all of it to a
// 956-line cockpit with a dispatch bar, a human-actions panel, a tactical-plays
// list and a four-tab Agent Desk whose detail drawer ended in a "Done" button
// that closed the drawer.
//
// Now: what needs a person (the next move, follow-ups due, people a mission
// made reachable, missions that asked), what the team is working on, and what
// came back since you looked, with older reports folded underneath.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export default async function DecisionsPage() {
  const session = await getSession();
  if (!session?.organizationId) {
    return (
      <PageHeader
        title="Today"
        description="Not available — organization context required."
      />
    );
  }

  const org = session.organizationId;

  const [
    move,
    cameBack,
    employees,
    missions,
    ready,
    followUps,
    waits,
    done,
    certAlerts,
    senders,
    pool,
    putForward,
  ] = await Promise.all([
    getNextMove(org),
    listWhatCameBack(org),
    listWorkforce(org),
    listMissionTabs(org),
    listReadyToContact(org),
    listFollowUpsDue(org),
    listInProgressWaits(org),
    listDoneSince(org),
    listCertAlerts(org),
    // Send from Triangle (DEV-013): every address this person may send from,
    // or none — then the card keeps Open mail only. More than one is a real
    // choice on the card, because a personal address and a company one say
    // different things to whoever receives the message.
    sendableMailboxesFor(org, session.userId),
    listAttachableWorkers(org),
    // Hanna's half of an open case: who we put forward, and in which form.
    listPutForwardCases(org),
  ]);
  // Cert Alerts left the menu (DEV-011); the exceptions are a Needs you card.
  const certs = certAlerts.filter(
    (c) => c.expiryStatus === "expired" || c.expiryStatus === "expiring_soon",
  );

  // Scout first, then Hanna, then the rest — the order the router in the Ask
  // box falls back through when a brief does not clearly belong to either.
  const roster = employees
    .filter((e) => e.status === "active")
    .sort((a, b) => rank(a.roleKey) - rank(b.roleKey))
    .map((e) => ({
      id: e.id,
      name: e.displayName,
      emoji: e.emoji,
      roleTitle: e.description,
    }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Today"
        description="What needs you, what the team is working on, and what came back. Handoff changes the owner — the case stays here."
      />
      {/* The refusal ledger used to open this page. A refused record is a
          check working, not a decision for the CEO, so it lives under
          Settings → Diagnostics (DEV-016). */}
      <TodayScreen
        move={move}
        employees={roster}
        cameBack={cameBack}
        missions={missions}
        ready={ready}
        followUps={followUps}
        waits={waits}
        done={done}
        certs={certs}
        sender={senders[0] ?? null}
        senders={senders}
        pool={pool}
        putForward={putForward}
      />
    </div>
  );
}

function rank(roleKey: string): number {
  if (roleKey === "project_researcher") return 0;
  if (roleKey === "hr" || roleKey === "triangle_hr") return 1;
  return 2;
}
