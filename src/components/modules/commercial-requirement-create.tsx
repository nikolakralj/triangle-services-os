"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import type { CommercialSourceOption } from "@/lib/data/commercial";

function commaList(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function dateTimeIso(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? new Date(text).toISOString() : undefined;
}

export function CommercialRequirementCreate({
  sources,
  defaultCurrency,
}: {
  sources: CommercialSourceOption[];
  defaultCurrency: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    const numberOrUndefined = (key: string) => {
      const value = String(form.get(key) ?? "").trim();
      return value ? Number(value) : undefined;
    };
    const body = {
      source: String(form.get("source") ?? "manual"),
      title: String(form.get("title") ?? ""),
      scopeSummary: String(form.get("scopeSummary") ?? ""),
      roles: commaList(form.get("roles")),
      headcountMin: numberOrUndefined("headcountMin"),
      headcountMax: numberOrUndefined("headcountMax"),
      country: String(form.get("country") ?? ""),
      city: String(form.get("city") ?? ""),
      startDateFrom: String(form.get("startDateFrom") ?? ""),
      startWindowText: String(form.get("startWindowText") ?? ""),
      durationWeeks: numberOrUndefined("durationWeeks"),
      engagementModel: String(form.get("engagementModel") ?? "unknown"),
      commercialNotes: String(form.get("commercialNotes") ?? ""),
      currency: String(form.get("currency") ?? defaultCurrency),
      rateUnit: String(form.get("rateUnit") ?? "") || undefined,
      unknowns: commaList(form.get("unknowns")),
      nextAction: String(form.get("nextAction") ?? ""),
      nextActionDueAt: dateTimeIso(form.get("nextActionDueAt")),
    };

    setSaving(true);
    try {
      const response = await fetch("/api/commercial/requirements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        requirementId?: string;
      };
      if (!response.ok || !result.requirementId) {
        setMessage(result.error ?? "Could not create requirement.");
        return;
      }
      router.push(`/commercial/${result.requirementId}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <Button type="button" variant="primary" onClick={() => setOpen(!open)}>
        {open ? "Close form" : "New requirement"}
      </Button>
      {open ? (
        <form
          className="mt-3 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-2 xl:grid-cols-4"
          onSubmit={submit}
        >
          <label className="text-sm font-medium text-slate-700 xl:col-span-2">
            Source
            <Select className="mt-1" name="source" defaultValue="manual">
              <option value="manual">Manual / buyer conversation</option>
              <option value="referral">Referral</option>
              <option value="supply_first">Supply-first package</option>
              {sources.map((source) => (
                <option key={source.value} value={source.value}>
                  {source.label} [{source.status}]
                </option>
              ))}
            </Select>
          </label>
          <label className="text-sm font-medium text-slate-700 xl:col-span-2">
            Requirement title
            <Input className="mt-1" name="title" maxLength={240} required />
          </label>
          <label className="text-sm font-medium text-slate-700 xl:col-span-4">
            Buyer need / scope
            <Textarea className="mt-1" name="scopeSummary" maxLength={4000} />
          </label>
          <label className="text-sm font-medium text-slate-700 xl:col-span-2">
            Roles (comma separated)
            <Input className="mt-1" name="roles" placeholder="PLC engineer, commissioning engineer" />
          </label>
          <div className="grid grid-cols-2 gap-3 xl:col-span-2">
            <label className="text-sm font-medium text-slate-700">
              Min headcount
              <Input className="mt-1" name="headcountMin" type="number" min={1} />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Max headcount
              <Input className="mt-1" name="headcountMax" type="number" min={1} />
            </label>
          </div>
          <label className="text-sm font-medium text-slate-700">
            Country
            <Input className="mt-1" name="country" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            City / region
            <Input className="mt-1" name="city" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Earliest start
            <Input className="mt-1" name="startDateFrom" type="date" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Start window if date unknown
            <Input className="mt-1" name="startWindowText" placeholder="Q4 / within 4 weeks" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Duration (weeks)
            <Input className="mt-1" name="durationWeeks" type="number" min={1} />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Engagement model
            <Select className="mt-1" name="engagementModel" defaultValue="unknown">
              <option value="unknown">Unknown</option>
              <option value="individual_contract">Individual contractors</option>
              <option value="team_supply">Team supply</option>
              <option value="managed_crew">Managed crew</option>
              <option value="subcontract_scope">Subcontracted scope</option>
              <option value="recruitment_fee">Recruitment fee</option>
              <option value="framework_calloff">Framework call-off</option>
            </Select>
          </label>
          <div className="grid grid-cols-[1fr_100px] gap-3 xl:col-span-2">
            <label className="text-sm font-medium text-slate-700">
              Rate / budget logic
              <Input className="mt-1" name="commercialNotes" placeholder="Budget unknown; ask for target day rate" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Currency
              <Input className="mt-1" name="currency" defaultValue={defaultCurrency} maxLength={3} />
            </label>
          </div>
          <label className="text-sm font-medium text-slate-700 xl:col-span-2">
            Known unknowns (comma separated)
            <Input className="mt-1" name="unknowns" placeholder="Shifts, payment terms, A1 route" />
          </label>
          <label className="text-sm font-medium text-slate-700 xl:col-span-2">
            Next commercial action
            <Input className="mt-1" name="nextAction" />
          </label>
          <label className="text-sm font-medium text-slate-700 xl:col-span-2">
            Next action due
            <Input className="mt-1" name="nextActionDueAt" type="datetime-local" />
          </label>
          <div className="flex items-center gap-3 xl:col-span-4">
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? "Creating…" : "Create draft requirement"}
            </Button>
            {message ? (
              <p className="text-sm text-rose-700" role="alert">
                {message}
              </p>
            ) : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}
