"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ArrowRight, Users, Package, Mail, TrendingUp } from "lucide-react";
import type {
  CompanyCrossProjectIntel,
  ProjectInvolvement,
  BuyerContactSummary,
  PackageSummary,
  OutreachSummary,
} from "@/lib/data/company-intel";
import { cn } from "@/lib/utils";

export function CompanyIntelligencePanel({
  intel,
}: {
  intel: CompanyCrossProjectIntel;
}) {
  const router = useRouter();

  if (intel.projectInvolvements.length === 0) {
    return (
      <Card className="mb-4">
        <CardContent className="py-6 text-center">
          <p className="text-sm text-slate-500">
            This company isn't involved in any tracked projects yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 mb-4">
      {/* Key Stats Bar */}
      <div className="grid gap-2 md:grid-cols-4">
        <StatCard
          label="Projects"
          value={intel.stats.totalProjects.toString()}
          icon={<TrendingUp className="h-4 w-4" />}
          color="bg-blue-50 text-blue-700"
        />
        <StatCard
          label="Buyer Contacts"
          value={intel.stats.totalBuyerContacts.toString()}
          icon={<Users className="h-4 w-4" />}
          color="bg-indigo-50 text-indigo-700"
        />
        <StatCard
          label="Packages"
          value={intel.stats.totalPackages.toString()}
          icon={<Package className="h-4 w-4" />}
          color="bg-amber-50 text-amber-700"
        />
        <StatCard
          label="Outreach"
          value={intel.stats.totalOutreach.toString()}
          icon={<Mail className="h-4 w-4" />}
          color="bg-emerald-50 text-emerald-700"
        />
      </div>

      {/* Projects Section */}
      {intel.projectInvolvements.length > 0 && (
        <Card>
          <CardHeader title={`Projects (${intel.projectInvolvements.length})`} />
          <CardContent className="space-y-3">
            {intel.projectInvolvements.map((project) => (
              <ProjectRow key={project.id} project={project} router={router} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Buyer Contacts Section */}
      {intel.buyerContacts.length > 0 && (
        <Card>
          <CardHeader title={`Buyer Contacts (${intel.buyerContacts.length})`} />
          <CardContent className="space-y-2">
            {intel.buyerContacts.map((contact) => (
              <ContactRow key={contact.id} contact={contact} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Packages Section */}
      {intel.packages.length > 0 && (
        <Card>
          <CardHeader title={`Packages (${intel.packages.length})`} />
          <CardContent className="space-y-2">
            {intel.packages.map((pkg) => (
              <PackageRow key={pkg.id} pkg={pkg} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Outreach Section */}
      {intel.outreach.length > 0 && (
        <Card>
          <CardHeader title={`Outreach Activity (${intel.outreach.length})`} />
          <CardContent className="space-y-2">
            {intel.outreach.map((item) => (
              <OutreachRow key={item.id} item={item} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <Card>
      <CardContent className={cn("pt-4", color)}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium opacity-75">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
          <div className="text-2xl opacity-50">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectRow({
  project,
  router,
}: {
  project: ProjectInvolvement;
  router: any;
}) {
  return (
    <div
      className="rounded-lg border border-slate-100 p-3 hover:bg-slate-50 transition-colors"
      key={project.id}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-semibold text-slate-900 truncate">{project.title}</p>
            <Badge intent="info" className="shrink-0">
              {project.companyRole}
            </Badge>
            {project.confidence !== null && (
              <Badge intent="success" className="shrink-0">
                {project.confidence}%
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-500 mb-2">
            {project.location} · {project.status}
          </p>
          <p className="text-sm text-slate-700 line-clamp-2 mb-2">
            {project.description}
          </p>
          <div className="flex gap-2 text-xs text-slate-600">
            {project.buyerContactCount > 0 && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {project.buyerContactCount} contact{project.buyerContactCount !== 1 ? "s" : ""}
              </span>
            )}
            {project.packageCount > 0 && (
              <span className="flex items-center gap-1">
                <Package className="h-3 w-3" />
                {project.packageCount} package{project.packageCount !== 1 ? "s" : ""}
              </span>
            )}
            {project.outreachCount > 0 && (
              <span className="flex items-center gap-1">
                <Mail className="h-3 w-3" />
                {project.outreachCount} outreach
              </span>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          onClick={() => router.push(`/hunter/${project.id}`)}
          className="shrink-0 h-8 px-2"
        >
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ContactRow({ contact }: { contact: BuyerContactSummary }) {
  return (
    <div className="rounded-md border border-slate-100 p-2 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-slate-900">
            {contact.fullName || "(no name)"}
          </p>
          {contact.jobTitle && (
            <p className="text-xs text-slate-600">{contact.jobTitle}</p>
          )}
          {contact.email && (
            <p className="text-xs text-slate-500 truncate">{contact.email}</p>
          )}
          <p className="text-xs text-slate-400 mt-1">{contact.projectTitle}</p>
        </div>
        {contact.buyerRole && (
          <Badge intent="neutral" className="shrink-0 text-xs">
            {contact.buyerRole}
          </Badge>
        )}
      </div>
    </div>
  );
}

function PackageRow({ pkg }: { pkg: PackageSummary }) {
  return (
    <div className="rounded-md border border-slate-100 p-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-slate-900">{pkg.title}</p>
          <p className="text-xs text-slate-500">
            {pkg.estimatedCrewSize
              ? `~${pkg.estimatedCrewSize} crew`
              : "Crew size TBD"}
            {pkg.confidence !== null && ` · ${pkg.confidence}% confidence`}
          </p>
          <p className="text-xs text-slate-400 mt-1">{pkg.projectTitle}</p>
        </div>
      </div>
    </div>
  );
}

function OutreachRow({ item }: { item: OutreachSummary }) {
  const channelColors: Record<string, string> = {
    linkedin_connect: "bg-sky-50 text-sky-700 border-sky-200",
    linkedin_message: "bg-indigo-50 text-indigo-700 border-indigo-200",
    email_cold: "bg-amber-50 text-amber-700 border-amber-200",
    email_followup: "bg-orange-50 text-orange-700 border-orange-200",
  };

  const statusColors: Record<string, string> = {
    draft: "bg-slate-50 text-slate-700 border-slate-200",
    sent: "bg-emerald-50 text-emerald-700 border-emerald-200",
    replied: "bg-violet-50 text-violet-700 border-violet-200",
    no_reply: "bg-rose-50 text-rose-700 border-rose-200",
    archived: "bg-slate-100 text-slate-500 border-slate-200",
  };

  return (
    <div className="rounded-md border border-slate-100 p-2 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex gap-1 mb-1">
            <Badge
              className={cn("text-xs border", channelColors[item.channel] || "")}
            >
              {item.channel.replace("_", " ")}
            </Badge>
            <Badge
              className={cn("text-xs border", statusColors[item.status] || "")}
            >
              {item.status}
            </Badge>
          </div>
          {item.subject && (
            <p className="text-slate-700 font-medium truncate">{item.subject}</p>
          )}
          {item.buyerName && (
            <p className="text-xs text-slate-600">to {item.buyerName}</p>
          )}
          <p className="text-xs text-slate-400 mt-1">{item.projectTitle}</p>
        </div>
      </div>
    </div>
  );
}
