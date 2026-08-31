import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MailboxSettingsPanel } from "@/components/modules/mailbox-settings-panel";
import { IntakeRulesPanel } from "@/components/modules/intake-rules-panel";
import { ReplyStylePanel } from "@/components/modules/reply-style-panel";
import { ChangePasswordPanel } from "@/components/modules/change-password-panel";
import { OrganizationProfilePanel } from "@/components/modules/organization-profile-panel";
import {
  COMPANY_TYPES,
  COUNTRIES,
  OFFER_TYPES,
  SECTORS,
} from "@/lib/constants";

const sections = [
  { label: "Your account", href: "#account" },
  { label: "Job Intake mailboxes", href: "#mailboxes" },
  { label: "What the agent looks for", href: "#intake-rules" },
  { label: "Reply style", href: "#reply-style" },
  { label: "Organization", href: "#organization" },
  { label: "Business defaults", href: "#business-defaults" },
];

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Simple admin settings for the MVP. User invites and technical settings should stay admin-controlled."
      />
      <div className="grid gap-4 xl:grid-cols-[260px_1fr]">
        <Card>
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
        <div className="space-y-4">
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
        </div>
      </div>
    </>
  );
}
