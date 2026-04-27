"use client";

import { useMemo, useState } from "react";
import { Copy, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select, Textarea } from "@/components/ui/field";
import { OFFER_TYPES } from "@/lib/constants";
import type { Company, Contact, Opportunity } from "@/lib/types";

const actions = [
  ["lead_score", "Score a company"],
  ["company_summary", "Generate company summary"],
  ["outreach_email", "Generate first outreach email"],
  ["follow_up_email", "Generate follow-up email"],
  ["call_script", "Generate call script"],
  ["proposal_draft", "Generate proposal outline"],
  ["weekly_report", "Generate weekly Ralph report"],
  ["document_template", "Generate document template"],
];

export function AIAssistant({
  companies,
  contacts,
  opportunities,
}: {
  companies: Company[];
  contacts: Contact[];
  opportunities: Opportunity[];
}) {
  const [generationType, setGenerationType] = useState("outreach_email");
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [contactId, setContactId] = useState("");
  const [opportunityId, setOpportunityId] = useState("");
  const [language, setLanguage] = useState("en");
  const [tone, setTone] = useState("professional");
  const [offerType, setOfferType] = useState(OFFER_TYPES[0]);
  const [customInstructions, setCustomInstructions] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const filteredContacts = useMemo(
    () =>
      contacts.filter(
        (contact) => !companyId || contact.companyId === companyId,
      ),
    [companyId, contacts],
  );
  const filteredOpportunities = useMemo(
    () =>
      opportunities.filter(
        (opportunity) => !companyId || opportunity.companyId === companyId,
      ),
    [companyId, opportunities],
  );

  async function generate() {
    setLoading(true);
    setMessage("");
    setOutput("");
    const response = await fetch("/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        generationType,
        companyId,
        contactId: contactId || undefined,
        opportunityId: opportunityId || undefined,
        language,
        tone,
        offerType,
        customInstructions,
      }),
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setMessage(data.error ?? "AI generation failed.");
      return;
    }
    setOutput(data.outputText ?? "");
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
      <Card>
        <CardHeader
          title="Predefined AI actions"
          description="Draft only. Nothing is sent automatically."
        />
        <CardContent className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">
            Action
            <Select
              value={generationType}
              onChange={(event) => setGenerationType(event.target.value)}
            >
              {actions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Company
            <Select
              value={companyId}
              onChange={(event) => setCompanyId(event.target.value)}
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Contact
            <Select
              value={contactId}
              onChange={(event) => setContactId(event.target.value)}
            >
              <option value="">No contact selected</option>
              {filteredContacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.fullName} · {contact.jobTitle}
                </option>
              ))}
            </Select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Opportunity
            <Select
              value={opportunityId}
              onChange={(event) => setOpportunityId(event.target.value)}
            >
              <option value="">No opportunity selected</option>
              {filteredOpportunities.map((opportunity) => (
                <option key={opportunity.id} value={opportunity.id}>
                  {opportunity.title}
                </option>
              ))}
            </Select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium text-slate-700">
              Language
              <Select
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
              >
                <option value="en">English</option>
                <option value="de">German</option>
                <option value="hr">Croatian</option>
              </Select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Tone
              <Select
                value={tone}
                onChange={(event) => setTone(event.target.value)}
              >
                <option value="direct">Direct</option>
                <option value="professional">Professional</option>
                <option value="friendly">Friendly</option>
                <option value="senior commercial">Senior commercial</option>
                <option value="technical">Technical</option>
                <option value="short">Short</option>
              </Select>
            </label>
          </div>
          <label className="block text-sm font-medium text-slate-700">
            Offer type
            <Select
              value={offerType}
              onChange={(event) => setOfferType(event.target.value)}
            >
              {OFFER_TYPES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Custom instructions
            <Textarea
              value={customInstructions}
              onChange={(event) => setCustomInstructions(event.target.value)}
              placeholder="Example: mention supervised crews, German communication and fast mobilization."
            />
          </label>
          <Button
            variant="primary"
            className="w-full"
            onClick={generate}
            disabled={loading}
          >
            <Sparkles className="h-4 w-4" />
            {loading ? "Generating..." : "Generate draft"}
          </Button>
          {message ? (
            <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              {message}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="AI output"
          description="Saved server-side when Supabase is configured; copy manually into your chosen outreach channel."
          action={
            <div className="flex gap-2">
              <Button
                onClick={() => output && navigator.clipboard.writeText(output)}
              >
                <Copy className="h-4 w-4" /> Copy
              </Button>
              <Button>
                <Save className="h-4 w-4" /> Save as activity
              </Button>
            </div>
          }
        />
        <CardContent>
          <pre className="min-h-[540px] whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-800">
            {output ||
              "Generated outreach, lead score, call script or document draft will appear here."}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
