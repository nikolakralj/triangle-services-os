import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { Activity, Company, Contact, DocumentRecord, Opportunity, Task, Worker } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

export function ActivityTimeline({ activities }: { activities: Activity[] }) {
  return (
    <div className="space-y-3">
      {activities.length ? (
        activities.map((activity) => (
          <div key={activity.id} className="rounded-md border border-slate-100 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-slate-950">{activity.title}</p>
              <Badge>{activity.activityType}</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">{activity.summary}</p>
            <p className="mt-2 text-xs text-slate-400">
              {activity.occurredAt} · {activity.createdByName ?? "—"}
            </p>
          </div>
        ))
      ) : (
        <p className="text-sm text-slate-500">No activities yet.</p>
      )}
    </div>
  );
}

export function CompanyDetail({
  company,
  contacts,
  opportunities,
  tasks,
  activities,
  documents,
}: {
  company: Company;
  contacts: Contact[];
  opportunities: Opportunity[];
  tasks: Task[];
  activities: Activity[];
  documents: DocumentRecord[];
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <Card>
          <CardHeader title="Overview" description={company.description} />
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Info label="Website" value={company.websiteDomain} />
            <Info label="Type" value={company.companyType} />
            <Info label="Country" value={`${company.country}, ${company.city}`} />
            <Info label="Owner" value={company.ownerName ?? "—"} />
            <Info label="Status" value={company.status} />
            <Info label="Priority" value={company.priority} />
            <Info label="Sectors" value={company.sectors.join(", ")} />
            <Info label="Next action" value={company.nextActionAt ?? "n/a"} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Pain points and source" />
          <CardContent className="space-y-3 text-sm text-slate-700">
            <p><b>Current projects:</b> {company.currentProjects ?? "Unknown"}</p>
            <p><b>Pain points:</b> {company.painPoints ?? "Unknown"}</p>
            <p><b>Source:</b> {company.sourceUrl ?? "Manual or unknown"}</p>
            <p><b>GDPR notes:</b> B2B legitimate interest; source URL/provenance should be preserved.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Activity timeline" />
          <CardContent><ActivityTimeline activities={activities} /></CardContent>
        </Card>
      </div>
      <div className="space-y-4">
        <Card>
          <CardHeader title="AI actions" />
          <CardContent className="grid gap-2">
            {["Generate company summary", "Generate outreach angle", "Generate first email", "Generate German email", "Generate call script", "Re-score lead"].map((label) => (
              <Button key={label}>{label}</Button>
            ))}
          </CardContent>
        </Card>
        <SideList title="Contacts" items={contacts.map((contact) => `${contact.fullName} · ${contact.jobTitle}`)} />
        <SideList title="Opportunities" items={opportunities.map((opportunity) => `${opportunity.title} · ${formatCurrency(opportunity.estimatedValue)}`)} />
        <SideList title="Tasks" items={tasks.map((task) => `${task.title} · ${task.dueDate ?? "no date"}`)} />
        <SideList title="Documents" items={documents.map((document) => `${document.title} · ${document.sensitivity}`)} />
      </div>
    </div>
  );
}

export function ContactDetail({
  contact,
  company,
  activities,
}: {
  contact: Contact;
  company?: Company;
  activities: Activity[];
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader title="Contact details" description={`${contact.jobTitle} at ${company?.name ?? "Unknown company"}`} />
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Info label="Email" value={contact.email} />
          <Info label="Phone" value={contact.phone ?? "n/a"} />
          <Info label="Role category" value={contact.roleCategory} />
          <Info label="Language" value={contact.language} />
          <Info label="Owner" value={contact.ownerName ?? "—"} />
          <Info label="Priority" value={contact.priority} />
          <Info label="Next action" value={contact.nextActionAt ?? "n/a"} />
          <Info label="Do not contact" value={contact.doNotContact ? "Yes" : "No"} />
        </CardContent>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader title="Actions" />
          <CardContent className="grid gap-2">
            {["Log call", "Log email", "Create follow-up task", "Generate personalized outreach email", "Generate follow-up email", "Mark do-not-contact"].map((label) => (
              <Button key={label}>{label}</Button>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Activity timeline" />
          <CardContent><ActivityTimeline activities={activities} /></CardContent>
        </Card>
      </div>
    </div>
  );
}

export function OpportunityDetail({
  opportunity,
  company,
  contact,
  activities,
}: {
  opportunity: Opportunity;
  company?: Company;
  contact?: Contact;
  activities: Activity[];
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <Card>
          <CardHeader title="Overview" description={opportunity.scopeSummary ?? "Opportunity scope not yet defined."} />
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Info label="Stage" value={opportunity.stageId} />
            <Info label="Company" value={company?.name ?? "n/a"} />
            <Info label="Primary contact" value={contact?.fullName ?? "n/a"} />
            <Info label="Type" value={opportunity.opportunityType} />
            <Info label="Country" value={opportunity.country} />
            <Info label="Crew size" value={String(opportunity.estimatedCrewSize ?? "n/a")} />
            <Info label="Start date" value={opportunity.expectedStartDate ?? "n/a"} />
            <Info label="Value" value={formatCurrency(opportunity.estimatedValue)} />
            <Info label="Probability" value={`${opportunity.probability}%`} />
            <Info label="Owner" value={opportunity.ownerName ?? "—"} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Scope" />
          <CardContent className="space-y-3 text-sm text-slate-700">
            <p><b>Client need:</b> {opportunity.clientNeed ?? "Unknown"}</p>
            <p><b>Next step:</b> {opportunity.nextStep ?? "Set next step"}</p>
            <p><b>Risk notes:</b> Add pricing, certification, language and mobilisation risks here.</p>
          </CardContent>
        </Card>
      </div>
      <div className="space-y-4">
        <Card>
          <CardHeader title="AI actions" />
          <CardContent className="grid gap-2">
            {["Generate discovery questions", "Generate proposal outline", "Generate follow-up email", "Generate call script", "Generate risk checklist"].map((label) => (
              <Button key={label}>{label}</Button>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Activities" />
          <CardContent><ActivityTimeline activities={activities} /></CardContent>
        </Card>
      </div>
    </div>
  );
}

export function WorkerDetail({ worker }: { worker: Worker }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader title="Worker overview" description="Basic MVP worker/freelancer record." />
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Info label="Role" value={worker.role} />
          <Info label="Type" value={worker.workerType} />
          <Info label="Country" value={`${worker.country}, ${worker.city ?? ""}`} />
          <Info label="Languages" value={worker.languages.join(", ")} />
          <Info label="Skills" value={worker.skills.join(", ")} />
          <Info label="Certificates" value={worker.certificates.join(", ")} />
          <Info label="Availability" value={worker.availabilityStatus} />
          <Info label="Available from" value={worker.availableFrom ?? "n/a"} />
          <Info label="Preferred countries" value={worker.preferredCountries.join(", ")} />
          <Info label="Rate expectation" value={worker.dailyRateExpectation ? `${worker.dailyRateExpectation} EUR/day` : worker.hourlyRateExpectation ? `${worker.hourlyRateExpectation} EUR/h` : "n/a"} />
          <Info label="Reliability" value={`${worker.reliabilityScore}/5`} />
          <Info label="Status" value={worker.status} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader title="Scores" />
        <CardContent className="space-y-3">
          <Score label="Quality" value={worker.qualityScore} />
          <Score label="Safety" value={worker.safetyScore} />
          <Score label="Reliability" value={worker.reliabilityScore} />
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}

function SideList({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <CardHeader title={title} />
      <CardContent className="space-y-2">
        {items.length ? items.map((item) => <p key={item} className="rounded-md bg-slate-50 p-2 text-sm text-slate-700">{item}</p>) : <p className="text-sm text-slate-500">None yet.</p>}
      </CardContent>
    </Card>
  );
}

function Score({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span>{value}/5</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-sky-500" style={{ width: `${value * 20}%` }} />
      </div>
    </div>
  );
}
