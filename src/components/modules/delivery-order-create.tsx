"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import type { OrderCreationOption } from "@/lib/data/delivery";

function number(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? Number(text) : undefined;
}

function iso(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? new Date(text).toISOString() : undefined;
}

export function DeliveryOrderCreate({ options }: { options: OrderCreationOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [requirementId, setRequirementId] = useState(options[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const selected = options.find((option) => option.id === requirementId);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "") || undefined;
    const body = {
      operation: "create_order",
      requirementId,
      buyerRouteId: value("buyerRouteId"),
      projectPackageId: selected?.projectPackageId ?? undefined,
      orderType: value("orderType"),
      title: value("title"),
      externalReference: value("externalReference"),
      buyerContractingEntity: value("buyerContractingEntity"),
      supplierLegalEntity: value("supplierLegalEntity"),
      scopeSummary: value("scopeSummary"),
      currency: value("currency"),
      contractValue: number(form.get("contractValue")),
      startDate: value("startDate"),
      endDate: value("endDate"),
      paymentTermsDays: number(form.get("paymentTermsDays")),
      timesheetFrequency: value("timesheetFrequency"),
      timesheetApprovalContact: value("timesheetApprovalContact"),
      billRate: number(form.get("billRate")),
      costRate: number(form.get("costRate")),
      rateUnit: value("rateUnit"),
      travelResponsibility: value("travelResponsibility"),
      accommodationResponsibility: value("accommodationResponsibility"),
      toolsPpeResponsibility: value("toolsPpeResponsibility"),
      legalReviewStatus: value("legalReviewStatus"),
      nextAction: value("nextAction"),
      nextActionDueAt: iso(form.get("nextActionDueAt")),
    };
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/delivery", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string; orderId?: string };
      if (!response.ok || !result.orderId) { setMessage(result.error ?? "Could not create order."); return; }
      router.push(`/delivery/${result.orderId}`); router.refresh();
    } finally { setSaving(false); }
  }

  return (
    <div>
      <Button variant="primary" type="button" disabled={options.length === 0} onClick={() => setOpen(!open)}>
        {open ? "Close" : "New order / agreement"}
      </Button>
      {options.length === 0 ? <p className="mt-2 text-sm text-amber-700">Qualify a commercial requirement and confirm its buyer route before creating an order.</p> : null}
      {open ? (
        <form className="mt-3 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 lg:grid-cols-2 xl:grid-cols-4" onSubmit={submit}>
          <label className="text-sm font-medium text-slate-700 xl:col-span-2">Qualified requirement
            <Select className="mt-1" value={requirementId} onChange={(event) => setRequirementId(event.target.value)} required>
              {options.map((option) => <option key={option.id} value={option.id}>{option.title}</option>)}
            </Select>
          </label>
          <label className="text-sm font-medium text-slate-700 xl:col-span-2">Confirmed buyer route
            <Select className="mt-1" name="buyerRouteId" defaultValue=""><option value="">No route linked</option>
              {(selected?.routes ?? []).map((route) => <option key={route.id} value={route.id}>{route.label} [{route.status}]</option>)}
            </Select>
          </label>
          <label className="text-sm font-medium text-slate-700">Record type<Select className="mt-1" name="orderType" defaultValue="job_order">
            <option value="nda">NDA</option><option value="msa">MSA</option><option value="framework">Framework</option><option value="sow">Statement of work</option>
            <option value="job_order">Job order</option><option value="purchase_order">Purchase order</option><option value="rate_card">Rate card</option>
            <option value="placement_order">Placement order</option><option value="other">Other</option>
          </Select></label>
          <label className="text-sm font-medium text-slate-700 xl:col-span-3">Title<Input className="mt-1" name="title" required /></label>
          <label className="text-sm font-medium text-slate-700">External reference<Input className="mt-1" name="externalReference" /></label>
          <label className="text-sm font-medium text-slate-700">Buyer contracting entity<Input className="mt-1" name="buyerContractingEntity" /></label>
          <label className="text-sm font-medium text-slate-700 xl:col-span-2">Your legal entity<Input className="mt-1" name="supplierLegalEntity" /></label>
          <label className="text-sm font-medium text-slate-700 xl:col-span-4">Scope<Textarea className="mt-1" name="scopeSummary" /></label>
          <label className="text-sm font-medium text-slate-700">Currency<Input className="mt-1" name="currency" defaultValue={selected?.currency ?? "EUR"} maxLength={3} /></label>
          <label className="text-sm font-medium text-slate-700">Contract value<Input className="mt-1" name="contractValue" type="number" min={0} step="0.01" /></label>
          <label className="text-sm font-medium text-slate-700">Start<Input className="mt-1" name="startDate" type="date" /></label>
          <label className="text-sm font-medium text-slate-700">End<Input className="mt-1" name="endDate" type="date" /></label>
          <label className="text-sm font-medium text-slate-700">Payment terms days<Input className="mt-1" name="paymentTermsDays" type="number" min={0} /></label>
          <label className="text-sm font-medium text-slate-700">Timesheet frequency<Input className="mt-1" name="timesheetFrequency" placeholder="weekly" /></label>
          <label className="text-sm font-medium text-slate-700 xl:col-span-2">Timesheet approval contact<Input className="mt-1" name="timesheetApprovalContact" /></label>
          <label className="text-sm font-medium text-slate-700">Bill rate<Input className="mt-1" name="billRate" type="number" min={0} step="0.01" /></label>
          <label className="text-sm font-medium text-slate-700">Direct cost rate<Input className="mt-1" name="costRate" type="number" min={0} step="0.01" /></label>
          <label className="text-sm font-medium text-slate-700">Rate unit<Input className="mt-1" name="rateUnit" placeholder="hour / day / fixed" /></label>
          <label className="text-sm font-medium text-slate-700">Legal review<Select className="mt-1" name="legalReviewStatus" defaultValue="review_needed">
            <option value="not_reviewed">Not reviewed</option><option value="review_needed">Review needed</option><option value="in_review">In review</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
          </Select></label>
          <label className="text-sm font-medium text-slate-700">Travel responsibility<Input className="mt-1" name="travelResponsibility" /></label>
          <label className="text-sm font-medium text-slate-700">Accommodation responsibility<Input className="mt-1" name="accommodationResponsibility" /></label>
          <label className="text-sm font-medium text-slate-700 xl:col-span-2">Tools / PPE responsibility<Input className="mt-1" name="toolsPpeResponsibility" /></label>
          <label className="text-sm font-medium text-slate-700 xl:col-span-2">Next action<Input className="mt-1" name="nextAction" /></label>
          <label className="text-sm font-medium text-slate-700 xl:col-span-2">Next action due<Input className="mt-1" name="nextActionDueAt" type="datetime-local" /></label>
          <div className="flex items-center gap-3 xl:col-span-4"><Button variant="primary" disabled={saving}>{saving ? "Creating…" : "Create draft order"}</Button>{message ? <p className="text-sm text-rose-700">{message}</p> : null}</div>
        </form>
      ) : null}
    </div>
  );
}
