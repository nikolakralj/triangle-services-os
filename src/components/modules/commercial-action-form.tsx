"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import type { BuyerRouteRow } from "@/lib/data/commercial";

function iso(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? new Date(text).toISOString() : undefined;
}

export function CommercialActionForm({
  requirementId,
  routes,
  packages,
  canConfirm,
}: {
  requirementId: string;
  routes: BuyerRouteRow[];
  packages: Array<{ id: string; title: string; status: string }>;
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
      buyerRouteId: value("buyerRouteId"),
      projectPackageId: value("projectPackageId"),
      actionType: value("actionType"),
      status: value("status"),
      channel: value("channel"),
      recipientName: value("recipientName"),
      recipientEmail: value("recipientEmail"),
      recipientCompany: value("recipientCompany"),
      subject: value("subject"),
      aiDraft: value("aiDraft"),
      finalContent: value("finalContent"),
      occurredAt: iso(form.get("occurredAt")),
      followUpAt: iso(form.get("followUpAt")),
      responseSummary: value("responseSummary"),
      objection: value("objection"),
      outcome: value("outcome"),
      nextAction: value("nextAction"),
      nextActionDueAt: iso(form.get("nextActionDueAt")),
    };
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/commercial/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Could not record commercial action.");
        return;
      }
      setMessage("Commercial action recorded.");
      setOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <Button type="button" onClick={() => setOpen(!open)}>{open ? "Close" : "Record commercial action"}</Button>
      {open ? (
        <form className="mt-3 grid gap-3 rounded-md bg-slate-50 p-3 lg:grid-cols-2" onSubmit={submit}>
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 lg:col-span-2">
            This form records an action; it never sends email, LinkedIn messages, packets, or proposals. Mark completed only after the human action actually occurred.
          </p>
          <label className="text-sm font-medium text-slate-700">Action type<Select className="mt-1" name="actionType" defaultValue="email">
            <option value="email">Email</option><option value="call">Call</option><option value="linkedin">LinkedIn</option>
            <option value="meeting">Meeting</option><option value="packet">Packet</option><option value="proposal">Proposal</option>
            <option value="prequalification">Prequalification</option><option value="note">Internal note</option><option value="other">Other</option>
          </Select></label>
          <label className="text-sm font-medium text-slate-700">Truth status<Select className="mt-1" name="status" defaultValue="planned">
            <option value="draft">Draft</option><option value="planned">Planned</option>
            {canConfirm ? <option value="completed">Completed</option> : null}
            {canConfirm ? <option value="responded">Responded</option> : null}
            {canConfirm ? <option value="no_response">No response</option> : null}
            <option value="cancelled">Cancelled</option>
          </Select></label>
          <label className="text-sm font-medium text-slate-700">Buyer route<Select className="mt-1" name="buyerRouteId" defaultValue=""><option value="">None</option>
            {routes.map((route) => <option key={route.id} value={route.id}>{route.buyer_company ?? route.contracting_entity ?? route.route_type} [{route.route_status}]</option>)}
          </Select></label>
          <label className="text-sm font-medium text-slate-700">Package<Select className="mt-1" name="projectPackageId" defaultValue=""><option value="">None</option>
            {packages.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </Select></label>
          <label className="text-sm font-medium text-slate-700">Channel<Input className="mt-1" name="channel" placeholder="email / phone / portal" /></label>
          <label className="text-sm font-medium text-slate-700">Recipient company<Input className="mt-1" name="recipientCompany" /></label>
          <label className="text-sm font-medium text-slate-700">Recipient name<Input className="mt-1" name="recipientName" /></label>
          <label className="text-sm font-medium text-slate-700">Recipient email<Input className="mt-1" name="recipientEmail" type="email" /></label>
          <label className="text-sm font-medium text-slate-700 lg:col-span-2">Subject<Input className="mt-1" name="subject" /></label>
          <label className="text-sm font-medium text-slate-700 lg:col-span-2">AI/original draft<Textarea className="mt-1 min-h-36" name="aiDraft" /></label>
          <label className="text-sm font-medium text-slate-700 lg:col-span-2">Final sent content or exact submitted/call record<Textarea className="mt-1 min-h-36" name="finalContent" /></label>
          <label className="text-sm font-medium text-slate-700">Occurred at<Input className="mt-1" name="occurredAt" type="datetime-local" /></label>
          <label className="text-sm font-medium text-slate-700">Follow-up at<Input className="mt-1" name="followUpAt" type="datetime-local" /></label>
          <label className="text-sm font-medium text-slate-700 lg:col-span-2">Response summary<Textarea className="mt-1" name="responseSummary" /></label>
          <label className="text-sm font-medium text-slate-700">Objection<Input className="mt-1" name="objection" /></label>
          <label className="text-sm font-medium text-slate-700">Outcome<Input className="mt-1" name="outcome" /></label>
          <label className="text-sm font-medium text-slate-700">Next action<Input className="mt-1" name="nextAction" /></label>
          <label className="text-sm font-medium text-slate-700">Next action due<Input className="mt-1" name="nextActionDueAt" type="datetime-local" /></label>
          <div className="flex items-center gap-3 lg:col-span-2"><Button variant="primary" disabled={saving}>{saving ? "Saving…" : "Record only — do not send"}</Button>{message ? <p className="text-sm text-rose-700" role="status">{message}</p> : null}</div>
        </form>
      ) : message ? <p className="mt-2 text-sm text-emerald-700">{message}</p> : null}
    </div>
  );
}
