import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { COMPANY_TYPES, COUNTRIES, OFFER_TYPES, SECTORS } from "@/lib/constants";

const sections = [
  "Organization",
  "Users",
  "Pipeline stages",
  "Company types",
  "Sectors",
  "Document categories",
  "AI settings",
  "Import settings",
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
              <button key={section} className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100">
                {section}
              </button>
            ))}
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Organization" description="Default organization is Triangle Services." />
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div><p className="text-sm font-medium">Name</p><p className="text-sm text-slate-500">Triangle Services</p></div>
              <div><p className="text-sm font-medium">Timezone</p><p className="text-sm text-slate-500">Europe/Zagreb</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader title="Business defaults" />
            <CardContent className="space-y-4">
              <div><p className="mb-2 text-sm font-medium">Company types</p><div className="flex flex-wrap gap-2">{COMPANY_TYPES.map((item) => <Badge key={item}>{item}</Badge>)}</div></div>
              <div><p className="mb-2 text-sm font-medium">Sectors</p><div className="flex flex-wrap gap-2">{SECTORS.map((item) => <Badge key={item} intent="info">{item}</Badge>)}</div></div>
              <div><p className="mb-2 text-sm font-medium">Countries</p><div className="flex flex-wrap gap-2">{COUNTRIES.map((item) => <Badge key={item}>{item}</Badge>)}</div></div>
              <div><p className="mb-2 text-sm font-medium">Offer types</p><div className="flex flex-wrap gap-2">{OFFER_TYPES.map((item) => <Badge key={item} intent="purple">{item}</Badge>)}</div></div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
