import Link from "next/link";
import { Badge, priorityIntent } from "@/components/ui/badge";
import type {
  Company,
  Contact,
  DocumentRecord,
  Opportunity,
  Task,
  Worker,
} from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

export function ContactsTable({
  contacts,
  companies,
}: {
  contacts: Contact[];
  companies: Company[];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[950px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            {[
              "Full name",
              "Job title",
              "Role",
              "Company",
              "Email",
              "Language",
              "Priority",
              "Owner",
              "Next action",
              "Opt-out",
            ].map((header) => (
              <th key={header} className="border-b border-slate-200 px-4 py-3">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {contacts.map((contact) => (
            <tr key={contact.id} className="border-b border-slate-100">
              <td className="px-4 py-3">
                <Link
                  className="font-semibold hover:text-sky-700"
                  href={`/contacts/${contact.id}`}
                >
                  {contact.fullName}
                </Link>
              </td>
              <td className="px-4 py-3">{contact.jobTitle}</td>
              <td className="px-4 py-3">{contact.roleCategory}</td>
              <td className="px-4 py-3">
                {
                  companies.find((company) => company.id === contact.companyId)
                    ?.name
                }
              </td>
              <td className="px-4 py-3">{contact.email}</td>
              <td className="px-4 py-3">{contact.language}</td>
              <td className="px-4 py-3">
                <Badge intent={priorityIntent(contact.priority)}>
                  {contact.priority}
                </Badge>
              </td>
              <td className="px-4 py-3">{contact.ownerName ?? "—"}</td>
              <td className="px-4 py-3">{contact.nextActionAt ?? "n/a"}</td>
              <td className="px-4 py-3">{contact.optOut ? "Yes" : "No"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OpportunitiesTable({
  opportunities,
  companies,
}: {
  opportunities: Opportunity[];
  companies: Company[];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[1050px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            {[
              "Title",
              "Company",
              "Stage",
              "Type",
              "Country",
              "Crew",
              "Value",
              "Expected start",
              "Probability",
              "Owner",
              "Next action",
              "Status",
            ].map((header) => (
              <th key={header} className="border-b border-slate-200 px-4 py-3">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {opportunities.map((opportunity) => (
            <tr key={opportunity.id} className="border-b border-slate-100">
              <td className="px-4 py-3">
                <Link
                  className="font-semibold hover:text-sky-700"
                  href={`/opportunities/${opportunity.id}`}
                >
                  {opportunity.title}
                </Link>
              </td>
              <td className="px-4 py-3">
                {
                  companies.find(
                    (company) => company.id === opportunity.companyId,
                  )?.name
                }
              </td>
              <td className="px-4 py-3">
                <Badge>{opportunity.stageId}</Badge>
              </td>
              <td className="px-4 py-3">{opportunity.opportunityType}</td>
              <td className="px-4 py-3">{opportunity.country}</td>
              <td className="px-4 py-3">
                {opportunity.estimatedCrewSize ?? "n/a"}
              </td>
              <td className="px-4 py-3">
                {formatCurrency(opportunity.estimatedValue)}
              </td>
              <td className="px-4 py-3">
                {opportunity.expectedStartDate ?? "n/a"}
              </td>
              <td className="px-4 py-3">{opportunity.probability}%</td>
              <td className="px-4 py-3">{opportunity.ownerName ?? "—"}</td>
              <td className="px-4 py-3">{opportunity.nextActionAt ?? "n/a"}</td>
              <td className="px-4 py-3">{opportunity.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TasksTable({ tasks }: { tasks: Task[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            {[
              "Title",
              "Related",
              "Assigned to",
              "Priority",
              "Due date",
              "Status",
            ].map((header) => (
              <th key={header} className="border-b border-slate-200 px-4 py-3">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id} className="border-b border-slate-100">
              <td className="px-4 py-3 font-medium">{task.title}</td>
              <td className="px-4 py-3">{task.relatedEntityType}</td>
              <td className="px-4 py-3">{task.assignedToName ?? "—"}</td>
              <td className="px-4 py-3">
                <Badge intent={priorityIntent(task.priority)}>
                  {task.priority}
                </Badge>
              </td>
              <td className="px-4 py-3">{task.dueDate ?? "n/a"}</td>
              <td className="px-4 py-3">
                <Badge>{task.status}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DocumentsTable({ documents }: { documents: DocumentRecord[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            {[
              "Title",
              "Category",
              "File type",
              "Version",
              "Uploaded by",
              "Uploaded",
              "Review",
              "Sensitivity",
              "Action",
            ].map((header) => (
              <th key={header} className="border-b border-slate-200 px-4 py-3">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {documents.map((document) => (
            <tr key={document.id} className="border-b border-slate-100">
              <td className="px-4 py-3 font-medium">{document.title}</td>
              <td className="px-4 py-3">{document.documentCategory}</td>
              <td className="px-4 py-3">{document.fileExtension}</td>
              <td className="px-4 py-3">v{document.version}</td>
              <td className="px-4 py-3">{document.uploadedByName ?? "—"}</td>
              <td className="px-4 py-3">{document.uploadedAt}</td>
              <td className="px-4 py-3">{document.reviewDate ?? "n/a"}</td>
              <td className="px-4 py-3">
                <Badge
                  intent={
                    document.sensitivity === "normal" ? "neutral" : "warning"
                  }
                >
                  {document.sensitivity}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <Link
                  className="text-sky-700 hover:underline"
                  href={`/api/documents/${document.id}/signed-url`}
                >
                  Signed URL
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WorkersTable({ workers }: { workers: Worker[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[1050px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            {[
              "Full name",
              "Role",
              "Country",
              "Languages",
              "Skills",
              "Availability",
              "Available from",
              "Preferred countries",
              "Rate",
              "Reliability",
              "Status",
            ].map((header) => (
              <th key={header} className="border-b border-slate-200 px-4 py-3">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {workers.map((worker) => (
            <tr key={worker.id} className="border-b border-slate-100">
              <td className="px-4 py-3">
                <Link
                  className="font-semibold hover:text-sky-700"
                  href={`/workers/${worker.id}`}
                >
                  {worker.fullName}
                </Link>
              </td>
              <td className="px-4 py-3">{worker.role}</td>
              <td className="px-4 py-3">{worker.country}</td>
              <td className="px-4 py-3">{worker.languages.join(", ")}</td>
              <td className="px-4 py-3">
                {worker.skills.slice(0, 2).join(", ")}
              </td>
              <td className="px-4 py-3">
                <Badge>{worker.availabilityStatus}</Badge>
              </td>
              <td className="px-4 py-3">{worker.availableFrom ?? "n/a"}</td>
              <td className="px-4 py-3">
                {worker.preferredCountries.join(", ")}
              </td>
              <td className="px-4 py-3">
                {worker.dailyRateExpectation
                  ? `${worker.dailyRateExpectation} EUR/day`
                  : worker.hourlyRateExpectation
                    ? `${worker.hourlyRateExpectation} EUR/h`
                    : "n/a"}
              </td>
              <td className="px-4 py-3">{worker.reliabilityScore}/5</td>
              <td className="px-4 py-3">
                <Badge>{worker.status}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
