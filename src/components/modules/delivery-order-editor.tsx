"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import type { CommercialOrderRow, DeliveryWorkspace } from "@/lib/data/delivery";

function number(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? Number(text) : undefined;
}
function iso(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? new Date(text).toISOString() : undefined;
}
function local(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function DeliveryOrderEditor({
  order,
  buyerRoutes,
}: {
  order: CommercialOrderRow;
  buyerRoutes: DeliveryWorkspace["buyerRoutes"];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const billRate = typeof order.rate_terms.bill_rate === "number" ? order.rate_terms.bill_rate : "";
  const costRate = typeof order.rate_terms.cost_rate === "number" ? order.rate_terms.cost_rate : "";
  const rateUnit = typeof order.rate_terms.rate_unit === "string" ? order.rate_terms.rate_unit : "";

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "") || undefined;
    const body = {
      operation: "update_order",
      orderId: order.id,
      status: value("status"), buyerRouteId: value("buyerRouteId"), orderType: value("orderType"), title: value("title"),
      externalReference: value("externalReference"), buyerContractingEntity: value("buyerContractingEntity"),
      supplierLegalEntity: value("supplierLegalEntity"), scopeSummary: value("scopeSummary"),
      currency: value("currency"), contractValue: number(form.get("contractValue")),
      startDate: value("startDate"), endDate: value("endDate"), paymentTermsDays: number(form.get("paymentTermsDays")),
      timesheetFrequency: value("timesheetFrequency"), timesheetApprovalContact: value("timesheetApprovalContact"),
      billRate: number(form.get("billRate")), costRate: number(form.get("costRate")), rateUnit: value("rateUnit"),
      travelResponsibility: value("travelResponsibility"), accommodationResponsibility: value("accommodationResponsibility"),
      toolsPpeResponsibility: value("toolsPpeResponsibility"), terminationTerms: value("terminationTerms"),
      replacementTerms: value("replacementTerms"), liabilityNotes: value("liabilityNotes"),
      legalReviewStatus: value("legalReviewStatus"), signedAt: iso(form.get("signedAt")),
      humanApproved: form.get("humanApproved") === "on", nextAction: value("nextAction"),
      nextActionDueAt: iso(form.get("nextActionDueAt")),
    };
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/delivery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) { setMessage(result.error ?? "Could not update order."); return; }
      setMessage("Order saved."); router.refresh();
    } finally { setSaving(false); }
  }

  return (
    <form className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4" onSubmit={save}>
      <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 xl:col-span-4">
        Signed/active requires a qualified requirement, its confirmed buyer route, external reference, both legal entities, start date, payment terms, rate terms, explicit signed time, and human approval.
      </p>
      <label className="text-sm font-medium text-slate-700">Status<Select className="mt-1" name="status" defaultValue={order.status}>
        <option value="draft">Draft</option><option value="under_review">Under review</option><option value="signed">Signed</option>
        <option value="active">Active</option><option value="completed">Completed</option><option value="terminated">Terminated</option><option value="cancelled">Cancelled</option>
      </Select></label>
      <label className="text-sm font-medium text-slate-700">Type<Select className="mt-1" name="orderType" defaultValue={order.order_type}>
        <option value="nda">NDA</option><option value="msa">MSA</option><option value="framework">Framework</option><option value="sow">Statement of work</option>
        <option value="job_order">Job order</option><option value="purchase_order">Purchase order</option><option value="rate_card">Rate card</option><option value="placement_order">Placement order</option><option value="other">Other</option>
      </Select></label>
      <label className="text-sm font-medium text-slate-700 xl:col-span-2">Confirmed buyer route<Select className="mt-1" name="buyerRouteId" defaultValue={order.buyer_route_id ?? ""}>
        <option value="">No route linked (draft only)</option>
        {buyerRoutes.map((route) => <option key={route.id} value={route.id}>{route.label} [{route.status}]</option>)}
      </Select></label>
      <label className="text-sm font-medium text-slate-700 xl:col-span-4">Title<Input className="mt-1" name="title" defaultValue={order.title} required /></label>
      <label className="text-sm font-medium text-slate-700">External reference<Input className="mt-1" name="externalReference" defaultValue={order.external_reference ?? ""} /></label>
      <label className="text-sm font-medium text-slate-700">Buyer entity<Input className="mt-1" name="buyerContractingEntity" defaultValue={order.buyer_contracting_entity ?? ""} /></label>
      <label className="text-sm font-medium text-slate-700 xl:col-span-2">Supplier legal entity<Input className="mt-1" name="supplierLegalEntity" defaultValue={order.supplier_legal_entity ?? ""} /></label>
      <label className="text-sm font-medium text-slate-700 xl:col-span-4">Scope<Textarea className="mt-1" name="scopeSummary" defaultValue={order.scope_summary ?? ""} /></label>
      <label className="text-sm font-medium text-slate-700">Currency<Input className="mt-1" name="currency" defaultValue={order.currency} maxLength={3} /></label>
      <label className="text-sm font-medium text-slate-700">Contract value<Input className="mt-1" name="contractValue" type="number" min={0} step="0.01" defaultValue={order.contract_value ?? ""} /></label>
      <label className="text-sm font-medium text-slate-700">Start<Input className="mt-1" name="startDate" type="date" defaultValue={order.start_date ?? ""} /></label>
      <label className="text-sm font-medium text-slate-700">End<Input className="mt-1" name="endDate" type="date" defaultValue={order.end_date ?? ""} /></label>
      <label className="text-sm font-medium text-slate-700">Payment days<Input className="mt-1" name="paymentTermsDays" type="number" min={0} defaultValue={order.payment_terms_days ?? ""} /></label>
      <label className="text-sm font-medium text-slate-700">Timesheet frequency<Input className="mt-1" name="timesheetFrequency" defaultValue={order.timesheet_frequency ?? ""} /></label>
      <label className="text-sm font-medium text-slate-700 xl:col-span-2">Timesheet approver<Input className="mt-1" name="timesheetApprovalContact" defaultValue={order.timesheet_approval_contact ?? ""} /></label>
      <label className="text-sm font-medium text-slate-700">Bill rate<Input className="mt-1" name="billRate" type="number" min={0} step="0.01" defaultValue={billRate} /></label>
      <label className="text-sm font-medium text-slate-700">Cost rate<Input className="mt-1" name="costRate" type="number" min={0} step="0.01" defaultValue={costRate} /></label>
      <label className="text-sm font-medium text-slate-700">Rate unit<Input className="mt-1" name="rateUnit" defaultValue={rateUnit} /></label>
      <label className="text-sm font-medium text-slate-700">Legal review<Select className="mt-1" name="legalReviewStatus" defaultValue={order.legal_review_status}>
        <option value="not_reviewed">Not reviewed</option><option value="review_needed">Review needed</option><option value="in_review">In review</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
      </Select></label>
      <label className="text-sm font-medium text-slate-700">Travel responsibility<Input className="mt-1" name="travelResponsibility" defaultValue={order.travel_responsibility ?? ""} /></label>
      <label className="text-sm font-medium text-slate-700">Accommodation responsibility<Input className="mt-1" name="accommodationResponsibility" defaultValue={order.accommodation_responsibility ?? ""} /></label>
      <label className="text-sm font-medium text-slate-700 xl:col-span-2">Tools / PPE responsibility<Input className="mt-1" name="toolsPpeResponsibility" defaultValue={order.tools_ppe_responsibility ?? ""} /></label>
      <label className="text-sm font-medium text-slate-700 xl:col-span-2">Termination terms<Textarea className="mt-1" name="terminationTerms" defaultValue={order.termination_terms ?? ""} /></label>
      <label className="text-sm font-medium text-slate-700 xl:col-span-2">Replacement terms<Textarea className="mt-1" name="replacementTerms" defaultValue={order.replacement_terms ?? ""} /></label>
      <label className="text-sm font-medium text-slate-700 xl:col-span-4">Liability / insurance notes<Textarea className="mt-1" name="liabilityNotes" defaultValue={order.liability_notes ?? ""} /></label>
      <label className="text-sm font-medium text-slate-700">Signed at<Input className="mt-1" name="signedAt" type="datetime-local" defaultValue={local(order.signed_at)} /></label>
      <label className="flex items-center gap-2 self-end rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"><input type="checkbox" name="humanApproved" defaultChecked={Boolean(order.human_approved_at)} /> Human reviewed/approved</label>
      <label className="text-sm font-medium text-slate-700">Next action<Input className="mt-1" name="nextAction" defaultValue={order.next_action ?? ""} /></label>
      <label className="text-sm font-medium text-slate-700">Next due<Input className="mt-1" name="nextActionDueAt" type="datetime-local" defaultValue={local(order.next_action_due_at)} /></label>
      <div className="flex items-center gap-3 xl:col-span-4"><Button variant="primary" disabled={saving}>{saving ? "Saving…" : "Save order truth"}</Button>{message ? <p className={message.endsWith("saved.") ? "text-sm text-emerald-700" : "text-sm text-rose-700"}>{message}</p> : null}</div>
    </form>
  );
}
