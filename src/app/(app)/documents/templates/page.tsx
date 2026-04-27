import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const templates = [
  "Generate basic HSE manual draft",
  "Generate incident reporting procedure draft",
  "Generate worker onboarding checklist",
  "Generate sample timesheet",
  "Generate daily report template",
  "Generate crew CV template",
  "Generate anti-corruption statement draft",
  "Generate GDPR/privacy statement draft",
  "Generate subcontractor agreement outline",
  "Generate worker document checklist",
  "Generate A1/posting process checklist",
  "Generate accommodation/transport process",
  "Generate rate card/pricing model template",
  "Generate capability statement draft",
];

export default function DocumentTemplatesPage() {
  return (
    <>
      <PageHeader
        title="Document template generator"
        description="AI-generated legal/compliance templates are always draft material requiring qualified review."
      />
      <Card>
        <CardHeader
          title="Template actions"
          description="Saved outputs should be stored in document_templates with review_needed status."
        />
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => (
            <Button key={template}>{template}</Button>
          ))}
        </CardContent>
      </Card>
      <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        DRAFT - for internal use only. Must be reviewed by qualified
        legal/compliance advisor before external use.
      </p>
    </>
  );
}
