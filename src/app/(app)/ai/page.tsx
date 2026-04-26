import { PageHeader } from "@/components/common/page-header";
import { AIAssistant } from "@/components/modules/ai-assistant";
import { companies, contacts, opportunities } from "@/lib/sample-data";

export default function AIPage() {
  return (
    <>
      <PageHeader
        title="AI Assistant"
        description="Internal business-development assistant for lead scoring, summaries, outreach drafts, call scripts, proposal outlines and document drafts."
      />
      <AIAssistant companies={companies} contacts={contacts} opportunities={opportunities} />
    </>
  );
}
