"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import type { CommercialRequirementRow } from "@/lib/data/commercial";

function list(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function number(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? Number(text) : undefined;
}

function dateTimeIso(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? new Date(text).toISOString() : undefined;
}

function localDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function CommercialRequirementEditor({
  requirement,
  packages,
  missingForQualification,
  canDecide,
}: {
  requirement: CommercialRequirementRow;
  packages: Array<{ id: string; title: string; status: string }>;
  missingForQualification: string[];
  canDecide: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    const payload = {
      title: String(form.get("title") ?? ""),
      status: String(form.get("status") ?? requirement.status),
      decisionReason: String(form.get("decisionReason") ?? ""),
      buyerConfirmed: form.get("buyerConfirmed") === "on",
      projectPackageId: String(form.get("projectPackageId") ?? "") || undefined,
      scopeSummary: String(form.get("scopeSummary") ?? ""),
      exclusions: String(form.get("exclusions") ?? ""),
      roles: list(form.get("roles")),
      headcountMin: number(form.get("headcountMin")),
      headcountMax: number(form.get("headcountMax")),
      seniority: String(form.get("seniority") ?? ""),
      country: String(form.get("country") ?? ""),
      city: String(form.get("city") ?? ""),
      siteLocation: String(form.get("siteLocation") ?? ""),
      startDateFrom: String(form.get("startDateFrom") ?? ""),
      startDateTo: String(form.get("startDateTo") ?? ""),
      startWindowText: String(form.get("startWindowText") ?? ""),
      durationWeeks: number(form.get("durationWeeks")),
      durationText: String(form.get("durationText") ?? ""),
      shiftPattern: String(form.get("shiftPattern") ?? ""),
      requiredSkills: list(form.get("requiredSkills")),
      requiredDocuments: list(form.get("requiredDocuments")),
      engagementModel: String(form.get("engagementModel") ?? "unknown"),
      budgetMin: number(form.get("budgetMin")),
      budgetMax: number(form.get("budgetMax")),
      currency: String(form.get("currency") ?? "EUR").toUpperCase(),
      rateUnit: String(form.get("rateUnit") ?? "") || undefined,
      paymentTermsDays: number(form.get("paymentTermsDays")),
      commercialNotes: String(form.get("commercialNotes") ?? ""),
      countryFeasibilityState: String(form.get("countryFeasibilityState") ?? "unknown"),
      supplierOnboardingState: String(form.get("supplierOnboardingState") ?? "unknown"),
      unknowns: list(form.get("unknowns")),
      demandEvidenceUrl: String(form.get("demandEvidenceUrl") ?? ""),
      demandEvidenceSummary: String(form.get("demandEvidenceSummary") ?? ""),
      demandEvidenceDate: String(form.get("demandEvidenceDate") ?? ""),
      nextAction: String(form.get("nextAction") ?? ""),
      nextActionDueAt: dateTimeIso(form.get("nextActionDueAt")),
    };

    setSaving(true);
    try {
      const response = await fetch(`/api/commercial/requirements/${requirement.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setMessage(body.error ?? "Could not save requirement.");
        return;
      }
      setMessage("Requirement saved.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4" onSubmit={save}>
      {missingForQualification.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 xl:col-span-4">
          <strong>Cannot qualify yet:</strong> {missingForQualification.join(", ")}.
        </div>
      ) : (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 xl:col-span-4">
          Qualification fields and a confirmed route are present. An admin or partner can record the decision.
        </div>
      )}
      <label className="text-sm font-medium text-slate-700 xl:col-span-2">
        Title
        <Input className="mt-1" name="title" defaultValue={requirement.title} required />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Status
        <Select className="mt-1" name="status" defaultValue={requirement.status}>
          <option value="draft">Draft</option>
          <option value="needs_information">Needs information</option>
          {canDecide ? <option value="qualified">Qualified</option> : null}
          {canDecide ? <option value="disqualified">Disqualified</option> : null}
          {canDecide ? <option value="proposal_ready">Proposal ready</option> : null}
          {canDecide ? <option value="ordered">Ordered</option> : null}
          {canDecide ? <option value="closed">Closed</option> : null}
        </Select>
      </label>
      <label className="flex items-center gap-2 self-end rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
        <input
          name="buyerConfirmed"
          type="checkbox"
          defaultChecked={Boolean(requirement.buyer_confirmed_at)}
          disabled={!canDecide}
        />
        Human-confirmed buyer demand
      </label>
      <label className="text-sm font-medium text-slate-700 xl:col-span-4">
        Scope
        <Textarea className="mt-1" name="scopeSummary" defaultValue={requirement.scope_summary ?? ""} />
      </label>
      <label className="text-sm font-medium text-slate-700 xl:col-span-2">
        Exclusions
        <Textarea className="mt-1" name="exclusions" defaultValue={requirement.exclusions ?? ""} />
      </label>
      <label className="text-sm font-medium text-slate-700 xl:col-span-2">
        Roles (comma separated)
        <Textarea className="mt-1" name="roles" defaultValue={requirement.roles.join(", ")} />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Min headcount
        <Input className="mt-1" name="headcountMin" type="number" min={1} defaultValue={requirement.headcount_min ?? ""} />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Max headcount
        <Input className="mt-1" name="headcountMax" type="number" min={1} defaultValue={requirement.headcount_max ?? ""} />
      </label>
      <label className="text-sm font-medium text-slate-700 xl:col-span-2">
        Seniority / composition
        <Input className="mt-1" name="seniority" defaultValue={requirement.seniority ?? ""} />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Country
        <Input className="mt-1" name="country" defaultValue={requirement.country ?? ""} />
      </label>
      <label className="text-sm font-medium text-slate-700">
        City
        <Input className="mt-1" name="city" defaultValue={requirement.city ?? ""} />
      </label>
      <label className="text-sm font-medium text-slate-700 xl:col-span-2">
        Site
        <Input className="mt-1" name="siteLocation" defaultValue={requirement.site_location ?? ""} />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Start from
        <Input className="mt-1" name="startDateFrom" type="date" defaultValue={requirement.start_date_from ?? ""} />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Start by
        <Input className="mt-1" name="startDateTo" type="date" defaultValue={requirement.start_date_to ?? ""} />
      </label>
      <label className="text-sm font-medium text-slate-700 xl:col-span-2">
        Start window text
        <Input className="mt-1" name="startWindowText" defaultValue={requirement.start_window_text ?? ""} />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Duration weeks
        <Input className="mt-1" name="durationWeeks" type="number" min={1} defaultValue={requirement.duration_weeks ?? ""} />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Duration text
        <Input className="mt-1" name="durationText" defaultValue={requirement.duration_text ?? ""} />
      </label>
      <label className="text-sm font-medium text-slate-700 xl:col-span-2">
        Shifts / schedule
        <Input className="mt-1" name="shiftPattern" defaultValue={requirement.shift_pattern ?? ""} />
      </label>
      <label className="text-sm font-medium text-slate-700 xl:col-span-2">
        Required skills
        <Input className="mt-1" name="requiredSkills" defaultValue={requirement.required_skills.join(", ")} />
      </label>
      <label className="text-sm font-medium text-slate-700 xl:col-span-2">
        Required documents
        <Input className="mt-1" name="requiredDocuments" defaultValue={requirement.required_documents.join(", ")} />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Engagement model
        <Select className="mt-1" name="engagementModel" defaultValue={requirement.engagement_model}>
          <option value="unknown">Unknown</option>
          <option value="individual_contract">Individual contractors</option>
          <option value="team_supply">Team supply</option>
          <option value="managed_crew">Managed crew</option>
          <option value="subcontract_scope">Subcontracted scope</option>
          <option value="recruitment_fee">Recruitment fee</option>
          <option value="framework_calloff">Framework call-off</option>
        </Select>
      </label>
      <label className="text-sm font-medium text-slate-700">
        Linked package
        <Select className="mt-1" name="projectPackageId" defaultValue={requirement.project_package_id ?? ""}>
          <option value="">No package linked</option>
          {packages.map((item) => (
            <option key={item.id} value={item.id}>{item.title} [{item.status}]</option>
          ))}
        </Select>
      </label>
      <label className="text-sm font-medium text-slate-700">
        Budget min
        <Input className="mt-1" name="budgetMin" type="number" min={0} step="0.01" defaultValue={requirement.budget_min ?? ""} />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Budget max
        <Input className="mt-1" name="budgetMax" type="number" min={0} step="0.01" defaultValue={requirement.budget_max ?? ""} />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Currency
        <Input className="mt-1" name="currency" maxLength={3} defaultValue={requirement.currency} />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Rate unit
        <Select className="mt-1" name="rateUnit" defaultValue={requirement.rate_unit ?? ""}>
          <option value="">Not set</option>
          <option value="hour">Hour</option><option value="day">Day</option><option value="week">Week</option>
          <option value="month">Month</option><option value="fixed">Fixed</option><option value="placement_fee">Placement fee</option>
        </Select>
      </label>
      <label className="text-sm font-medium text-slate-700">
        Payment terms days
        <Input className="mt-1" name="paymentTermsDays" type="number" min={0} defaultValue={requirement.payment_terms_days ?? ""} />
      </label>
      <label className="text-sm font-medium text-slate-700 xl:col-span-3">
        Rate / commercial logic
        <Input className="mt-1" name="commercialNotes" defaultValue={requirement.commercial_notes ?? ""} />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Country feasibility
        <Select className="mt-1" name="countryFeasibilityState" defaultValue={requirement.country_feasibility_state}>
          <option value="unknown">Unknown</option><option value="review_needed">Review needed</option>
          <option value="feasible">Feasible</option><option value="blocked">Blocked</option>
        </Select>
      </label>
      <label className="text-sm font-medium text-slate-700">
        Supplier onboarding
        <Select className="mt-1" name="supplierOnboardingState" defaultValue={requirement.supplier_onboarding_state}>
          <option value="unknown">Unknown</option><option value="not_required">Not required</option>
          <option value="researching">Researching</option><option value="in_progress">In progress</option>
          <option value="approved">Approved</option><option value="blocked">Blocked</option><option value="rejected">Rejected</option>
        </Select>
      </label>
      <label className="text-sm font-medium text-slate-700 xl:col-span-2">
        Unknowns
        <Input className="mt-1" name="unknowns" defaultValue={requirement.unknowns.join(", ")} />
      </label>
      <label className="text-sm font-medium text-slate-700 xl:col-span-2">
        Demand evidence URL
        <Input className="mt-1" name="demandEvidenceUrl" defaultValue={requirement.demand_evidence_url ?? ""} />
      </label>
      <label className="text-sm font-medium text-slate-700 xl:col-span-2">
        Evidence date
        <Input className="mt-1" name="demandEvidenceDate" type="date" defaultValue={requirement.demand_evidence_date ?? ""} />
      </label>
      <label className="text-sm font-medium text-slate-700 xl:col-span-4">
        Demand evidence summary
        <Textarea className="mt-1" name="demandEvidenceSummary" defaultValue={requirement.demand_evidence_summary ?? ""} />
      </label>
      <label className="text-sm font-medium text-slate-700 xl:col-span-2">
        Next action
        <Input className="mt-1" name="nextAction" defaultValue={requirement.next_action ?? ""} />
      </label>
      <label className="text-sm font-medium text-slate-700 xl:col-span-2">
        Next action due
        <Input className="mt-1" name="nextActionDueAt" type="datetime-local" defaultValue={localDateTime(requirement.next_action_due_at)} />
      </label>
      <label className="text-sm font-medium text-slate-700 xl:col-span-4">
        Decision / disqualification reason
        <Input className="mt-1" name="decisionReason" defaultValue={requirement.decision_reason ?? ""} />
      </label>
      <div className="flex items-center gap-3 xl:col-span-4">
        <Button type="submit" variant="primary" disabled={saving}>{saving ? "Saving…" : "Save requirement"}</Button>
        {message ? <p className={message.endsWith("saved.") ? "text-sm text-emerald-700" : "text-sm text-rose-700"} role="status">{message}</p> : null}
      </div>
    </form>
  );
}
