import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MailboxSettingsPanel } from "@/components/modules/mailbox-settings-panel";
import { IntakeRulesPanel } from "@/components/modules/intake-rules-panel";
import { ReplyStylePanel } from "@/components/modules/reply-style-panel";
import { ChangePasswordPanel } from "@/components/modules/change-password-panel";
import { OrganizationProfilePanel } from "@/components/modules/organization-profile-panel";
import { RefusalLedger } from "@/components/modules/refusal-ledger";
import { TeamSettings } from "@/components/modules/team-settings";
import { MembersSettings } from "@/components/modules/members-settings";
import { HireEmployee } from "@/components/modules/hire-employee";
import { WorkLog } from "@/components/modules/work-log";
import { getSession } from "@/lib/auth/session";
import { summarizeRefusals } from "@/lib/data/refusals";
import { listTeam } from "@/lib/data/team";
import { listHumans } from "@/lib/data/workforce";
import { listAgentRuns } from "@/lib/data/agents";
import {
  COMPANY_TYPES,
  COUNTRIES,
  OFFER_TYPES,
  SECTORS,
} from "@/lib/constants";

export const dynamic = "force-dynamic";

const NOTICES: Record<string, string> = {
  // Old /agents bookmarks and links land here (DEV-012 slice B).
  workforce: "Workforce moved here. Work is handed out from the case.",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Diagnostics are for whoever runs the organization. A refused record is a
  // check that worked, so it sits here rather than on Today (DEV-016).
  const [session, params] = await Promise.all([getSession(), searchParams]);
  const orgId = session?.organizationId ?? null;
  const canSeeDiagnostics =
    Boolean(orgId) && (session?.role === "admin" || session?.role === "partner");
  const canWriteRules = session?.role === "admin" || session?.role === "partner";
  // Issuing a badge is an admin action; partners see the team, not the door.
  const canHire = session?.role === "admin";
  const notice =
    typeof params.notice === "string" ? (NOTICES[params.notice] ?? null) : null;
  // The AI employees live here, not in the menu: work is handed out from the
  // case, and this is where an admin sees who carries what (DEV-012). The
  // humans board and the work log moved here from Workforce with slice B.
  const [refusals, team, humans, runs] = await Promise.all([
    canSeeDiagnostics && orgId ? summarizeRefusals(orgId) : Promise.resolve(null),
    orgId ? listTeam(orgId) : Promise.resolve([]),
    orgId ? listHumans(orgId) : Promise.resolve([]),
    canSeeDiagnostics && orgId ? listAgentRuns(orgId) : Promise.resolve([]),
  ]);
  const workLogEmployees = team
    .filter((m) => m.employee.badgeName)
    .map((m) => ({
      badgeName: m.employee.badgeName as string,
      displayName: m.employee.displayName,
      emoji: m.employee.emoji,
    }));

  const sections = [
    { label: "Team", href: "#team" },
    { label: "Members", href: "#members" },
    { label: "Your account", href: "#account" },
    { label: "Job Intake mailboxes", href: "#mailboxes" },
    { label: "What the agent looks for", href: "#intake-rules" },
    { label: "Reply style", href: "#reply-style" },
    { label: "Organization", href: "#organization" },
    { label: "Business defaults", href: "#business-defaults" },
    { label: "Setup & data", href: "#setup" },
    ...(canSeeDiagnostics ? [{ label: "Diagnostics", href: "#diagnostics" }] : []),
  ];

  // Pages that left the menu (DEV-011). Nothing was deleted; they open here.
  const setupLinks = [
    {
      href: "/onboarding",
      label: "Setup readiness",
      hint: "A truthful checklist for the first safe intake, qualification, draft and package.",
    },
    {
      href: "/imports",
      label: "Data imports",
      hint: "Bring people in — one CV at a time, or the whole roster from a spreadsheet.",
    },
  ];
  const diagnosticPages = [
    {
      href: "/hunter",
      label: "Signal Inbox",
      hint: "Every project the employees found, with status, sector and country filters. Scout works these from missions.",
    },
    {
      href: "/job-intake",
      label: "Job Intake",
      hint: "Mail ingestion, scoring, leads and reply history.",
    },
    {
      href: "/workers/cert-checklist",
      label: "Certificate expiry list",
      hint: "Every worker certificate expiring within 60 days. The exceptions are on Today.",
    },
  ];

  return (
    <>
      <PageHeader
        title="Settings"
        description="Simple admin settings for the MVP. User invites and technical settings should stay admin-controlled."
      />
      {notice ? (
        <p
          role="status"
          className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"
        >
          {notice}
        </p>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-[260px_1fr]">
        <div>
          <Card className="xl:sticky xl:top-4">
            <CardContent className="space-y-2">
              {sections.map((section) => (
                <a
                  key={section.href}
                  href={section.href}
                  className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  {section.label}
                </a>
              ))}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <Card id="team" className="scroll-mt-20">
            <CardHeader
              title="Team"
              description="Your AI employees: whether they are awake, what they carry, what their badge allows, how they are told to work, and what they did lately. Nothing is handed out from here."
            />
            <CardContent className="space-y-4">
              <TeamSettings members={team} canWriteRules={canWriteRules} />
              {canHire && (
                <div className="border-t border-slate-100 pt-4">
                  <HireEmployee />
                </div>
              )}
            </CardContent>
          </Card>
          <Card id="members" className="scroll-mt-20">
            <CardHeader
              title="Members"
              description="The people in this organization and their roles. Invites stay admin-controlled."
            />
            <CardContent>
              <MembersSettings members={humans} />
            </CardContent>
          </Card>
          <Card id="account" className="scroll-mt-20">
            <CardHeader
              title="Your account"
              description="Change the password you use to sign in."
            />
            <CardContent>
              <ChangePasswordPanel />
            </CardContent>
          </Card>
          <Card id="mailboxes" className="scroll-mt-20">
            <CardHeader
              title="Job Intake mailboxes"
              description="Mailboxes the agent reads for agency opportunities."
            />
            <CardContent>
              <MailboxSettingsPanel />
            </CardContent>
          </Card>
          <Card id="intake-rules" className="scroll-mt-20">
            <CardHeader
              title="What the agent looks for"
              description="Your own scoring rules. The AI reads these on every email."
            />
            <CardContent>
              <IntakeRulesPanel />
            </CardContent>
          </Card>
          <Card id="reply-style" className="scroll-mt-20">
            <CardHeader
              title="Reply style"
              description="How your organization should sound when drafting replies."
            />
            <CardContent>
              <ReplyStylePanel />
            </CardContent>
          </Card>
          <Card id="organization" className="scroll-mt-20">
            <CardHeader
              title="Organization"
              description="The factual identity and commercial positioning used by your AI-assisted workflows."
            />
            <CardContent>
              <OrganizationProfilePanel />
            </CardContent>
          </Card>
          <Card id="business-defaults" className="scroll-mt-20">
            <CardHeader title="Business defaults" />
            <CardContent className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-medium">Company types</p>
                <div className="flex flex-wrap gap-2">
                  {COMPANY_TYPES.map((item) => (
                    <Badge key={item}>{item}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">Sectors</p>
                <div className="flex flex-wrap gap-2">
                  {SECTORS.map((item) => (
                    <Badge key={item} intent="info">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">Countries</p>
                <div className="flex flex-wrap gap-2">
                  {COUNTRIES.map((item) => (
                    <Badge key={item}>{item}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">Offer types</p>
                <div className="flex flex-wrap gap-2">
                  {OFFER_TYPES.map((item) => (
                    <Badge key={item} intent="purple">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
          <Card id="setup" className="scroll-mt-20">
            <CardHeader
              title="Setup & data"
              description="Getting the organization ready and getting people in. These left the menu; they did not go away."
            />
            <CardContent>
              <LinkList items={setupLinks} />
            </CardContent>
          </Card>
          {canSeeDiagnostics && (
            <Card id="diagnostics" className="scroll-mt-20">
              <CardHeader
                title="Diagnostics"
                description="Machine records for whoever maintains Triangle; nothing here needs a business decision."
              />
              <CardContent className="space-y-6">
                <section>
                  <h3 className="text-sm font-semibold text-slate-900">Hidden pages</h3>
                  <p className="mb-3 mt-0.5 text-[13px] text-slate-500">
                    Lists that are not operating surfaces. The data stays; the record
                    opens from the case.
                  </p>
                  <LinkList items={diagnosticPages} />
                </section>
                {refusals && (
                  <section>
                    <h3 className="text-sm font-semibold text-slate-900">Refused records</h3>
                    <p className="mb-3 mt-0.5 text-[13px] text-slate-500">
                      What the system refused to record in the last seven days, in the
                      database&apos;s own words.
                    </p>
                    <RefusalLedger summary={refusals} />
                  </section>
                )}
                <section id="work-log" className="scroll-mt-20">
                  <h3 className="text-sm font-semibold text-slate-900">Work log</h3>
                  <p className="mb-3 mt-0.5 text-[13px] text-slate-500">
                    Every run an AI employee reported, newest first. Moved here from
                    Workforce.
                  </p>
                  <WorkLog runs={runs} employees={workLogEmployees} />
                </section>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function LinkList({ items }: { items: Array<{ href: string; label: string; hint: string }> }) {
  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
      {items.map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            className="flex items-center justify-between gap-3 px-3 py-2.5 transition hover:bg-slate-50"
          >
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-slate-900">{item.label}</span>
              <span className="block text-[12px] text-slate-500">{item.hint}</span>
            </span>
            <span className="shrink-0 text-[12px] font-medium text-sky-700">Open →</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
