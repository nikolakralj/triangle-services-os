"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";

function iso(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? new Date(text).toISOString() : undefined;
}

export function BuyerRouteForm({
  requirementId,
  chainNodes,
  buyerContacts,
  canConfirm,
}: {
  requirementId: string;
  chainNodes: Array<{ id: string; label: string; company_name: string | null; role: string }>;
  buyerContacts: Array<{ id: string; full_name: string | null; company_name: string | null; job_title: string | null; email: string | null }>;
  canConfirm: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "") || undefined;
    const body = {
      requirementId,
      chainNodeId: value("chainNodeId"),
      buyerContactId: value("buyerContactId"),
      routeType: value("routeType"),
      routeStatus: value("routeStatus"),
      contractingEntity: value("contractingEntity"),
      buyerCompany: value("buyerCompany"),
      buyerContactName: value("buyerContactName"),
      buyerContactEmail: value("buyerContactEmail"),
      portalUrl: value("portalUrl"),
      evidenceUrl: value("evidenceUrl"),
      evidenceSummary: value("evidenceSummary"),
      onboardingRequirements: value("onboardingRequirements"),
      engagementModel: value("engagementModel"),
      nextAction: value("nextAction"),
      nextActionDueAt: iso(form.get("nextActionDueAt")),
    };
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/commercial/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Could not create buyer route.");
        return;
      }
      setMessage("Buyer route recorded.");
      setOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <Button type="button" onClick={() => setOpen(!open)}>{open ? "Close" : "Add buyer / supplier route"}</Button>
      {open ? (
        <form className="mt-3 grid gap-3 rounded-md bg-slate-50 p-3 lg:grid-cols-2" onSubmit={submit}>
          <label className="text-sm font-medium text-slate-700">Route type
            <Select className="mt-1" name="routeType" defaultValue="direct_buyer">
              <option value="direct_buyer">Direct buyer</option><option value="recruiter">Recruiter / agency</option>
              <option value="framework">Framework</option><option value="supplier_portal">Supplier portal</option>
              <option value="referral">Referral</option><option value="subcontractor">Subcontractor route</option><option value="other">Other</option>
            </Select>
          </label>
          <label className="text-sm font-medium text-slate-700">Route status
            <Select className="mt-1" name="routeStatus" defaultValue="researching">
              <option value="unknown">Unknown</option><option value="researching">Researching</option>
              <option value="contact_identified">Contact identified</option>
              {canConfirm ? <option value="contacted">Contacted</option> : null}
              {canConfirm ? <option value="prequalification">Prequalification</option> : null}
              {canConfirm ? <option value="confirmed">Confirmed</option> : null}
              {canConfirm ? <option value="approved">Approved</option> : null}
              {canConfirm ? <option value="blocked">Blocked</option> : null}
              {canConfirm ? <option value="rejected">Rejected</option> : null}
              {canConfirm ? <option value="dormant">Dormant</option> : null}
            </Select>
          </label>
          <label className="text-sm font-medium text-slate-700">Contractor-chain node
            <Select className="mt-1" name="chainNodeId" defaultValue=""><option value="">None</option>
              {chainNodes.map((node) => <option key={node.id} value={node.id}>{node.company_name ?? node.label} [{node.role}]</option>)}
            </Select>
          </label>
          <label className="text-sm font-medium text-slate-700">Accepted buyer contact
            <Select className="mt-1" name="buyerContactId" defaultValue=""><option value="">None</option>
              {buyerContacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.full_name ?? "Unnamed"} — {contact.company_name ?? "company unknown"}</option>)}
            </Select>
          </label>
          <label className="text-sm font-medium text-slate-700">Contracting entity<Input className="mt-1" name="contractingEntity" /></label>
          <label className="text-sm font-medium text-slate-700">Buyer company<Input className="mt-1" name="buyerCompany" /></label>
          <label className="text-sm font-medium text-slate-700">Contact name<Input className="mt-1" name="buyerContactName" /></label>
          <label className="text-sm font-medium text-slate-700">Contact email<Input className="mt-1" name="buyerContactEmail" type="email" /></label>
          <label className="text-sm font-medium text-slate-700 lg:col-span-2">Portal / route URL<Input className="mt-1" name="portalUrl" /></label>
          <label className="text-sm font-medium text-slate-700 lg:col-span-2">Evidence URL<Input className="mt-1" name="evidenceUrl" /></label>
          <label className="text-sm font-medium text-slate-700 lg:col-span-2">Evidence summary<Textarea className="mt-1" name="evidenceSummary" /></label>
          <label className="text-sm font-medium text-slate-700 lg:col-span-2">Onboarding / prequalification requirements<Textarea className="mt-1" name="onboardingRequirements" /></label>
          <label className="text-sm font-medium text-slate-700">Permitted engagement model<Input className="mt-1" name="engagementModel" /></label>
          <label className="text-sm font-medium text-slate-700">Next action<Input className="mt-1" name="nextAction" /></label>
          <label className="text-sm font-medium text-slate-700">Next action due<Input className="mt-1" name="nextActionDueAt" type="datetime-local" /></label>
          <div className="flex items-center gap-3 lg:col-span-2"><Button variant="primary" disabled={saving}>{saving ? "Saving…" : "Record route"}</Button>{message ? <p className="text-sm text-rose-700" role="status">{message}</p> : null}</div>
        </form>
      ) : message ? <p className="mt-2 text-sm text-emerald-700">{message}</p> : null}
    </div>
  );
}
