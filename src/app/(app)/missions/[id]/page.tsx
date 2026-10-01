import { notFound } from "next/navigation";
import { requireSession, capabilities } from "@/lib/auth/session";
import { getMissionWorkspace } from "@/lib/data/missions";
import { parseMissionSurfaceTab } from "@/lib/data/mission-shared";
import { MissionView } from "@/components/missions/mission-view";
import { AskPageContext } from "@/components/missions/ask-context";
import { ReportedWork } from "@/components/modules/reported-work";
import { listReportsForCase } from "@/lib/data/employee-reports";
import { buildCasePage } from "@/lib/data/case-page";
import { casePageInput, loadCaseMail, threadReplyDraft } from "@/lib/data/case-page-load";
import { sendableMailboxesFor } from "@/lib/data/mail-send";
import { CasePageScreen } from "@/components/modules/case-page";
import { CaseAsk, CaseDrafts } from "@/components/modules/case-drafts";
import { WhatsAppOnRecord } from "@/components/modules/whatsapp-on-record";
import { listWhatsAppForCase } from "@/lib/data/whatsapp";

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
  const [reports, whatsapp] = await Promise.all([
    listReportsForCase(session.organizationId, id),
    listWhatsAppForCase(session.organizationId, id),
  ]);
  const whatsappLine =
    whatsapp.drafts.length + whatsapp.waiting.length > 0 ? (
      <WhatsAppOnRecord record={whatsapp} />
    ) : null;
  if (workspace.requirementRoles.length > 0) {
    const [mail, senders] = await Promise.all([
      loadCaseMail(session.organizationId, id),
      sendableMailboxesFor(session.organizationId, session.userId),
    ]);
    const threadDraft =
      mail && mail.drafts.length > 0 ? null : threadReplyDraft(workspace.steps, workspace.messages);
    const built = buildCasePage(
      casePageInput({
        workspace,
        reports,
        mail,
        threadDraft,
      }),
    );
    if (built.ok) {
      const replyFrom =
        mail?.arrivedInAccountId && senders.some((box) => box.id === mail.arrivedInAccountId)
          ? mail.arrivedInAccountId
          : null;
      return (
        <>
          <AskPageContext kind="mission" missionId={id} />
          <CasePageScreen
            model={built.model}
            drafts={
              <CaseDrafts
                letters={built.model.drafts}
                to={mail?.clientEmail ?? null}
                who={built.model.askedBy}
                leadId={mail?.leadId ?? undefined}
                sender={senders[0] ?? null}
                senders={senders}
                replyFrom={replyFrom}
              />
            }
            whatsapp={whatsappLine}
            ask={
              caps.canWrite ? (
                <CaseAsk
                  who={built.model.askedBy}
                  about={built.model.place}
                  leadId={mail?.leadId ?? undefined}
                  missionId={id}
                  email={mail?.clientEmail ?? null}
                />
              ) : null
            }
          />
        </>
      );
    }
    console.error("case page:", built.errors.join("; "));
  }
  // A role that cannot see Triangle's people on the Talent Pool page does not
  // see them through a recruiting mission either.
  const visible = caps.canSeeWorkers ? workspace : { ...workspace, candidates: [], partners: [] };
  const sp = await searchParams;
  const tabRaw = sp.tab;
  const initialTab = parseMissionSurfaceTab(
    typeof tabRaw === "string" ? tabRaw : Array.isArray(tabRaw) ? tabRaw[0] : null,
  );

  return (
    <>
      {/* Ask on this page defaults to this mission: the next instruction, not a new one. */}
      <AskPageContext kind="mission" missionId={id} />
      <MissionView
        workspace={visible}
        canWrite={caps.canWrite}
        canSeeWorkers={caps.canSeeWorkers}
        initialTab={initialTab}
      />
      {whatsappLine}
      {reports.length > 0 && (
        <div className="mt-4">
          <ReportedWork reports={reports} />
        </div>
      )}
    </>
  );
}
