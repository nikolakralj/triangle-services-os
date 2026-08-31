"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import type { BuyerRouteRow, CommercialActionRow } from "@/lib/data/commercial";

function iso(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? new Date(text).toISOString() : undefined;
}

function localDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function BuyerRouteEditor({ route, canConfirm }: { route: BuyerRouteRow; canConfirm: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = {
      routeStatus: String(form.get("routeStatus") ?? route.route_status),
      evidenceSummary: String(form.get("evidenceSummary") ?? ""),
      onboardingRequirements: String(form.get("onboardingRequirements") ?? ""),
      nextAction: String(form.get("nextAction") ?? ""),
      nextActionDueAt: iso(form.get("nextActionDueAt")),
    };
    setSaving(true); setMessage("");
    try {
      const response = await fetch(`/api/commercial/routes/${route.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) { setMessage(result.error ?? "Could not update route."); return; }
      setMessage("Route updated."); router.refresh();
    } finally { setSaving(false); }
  }

  return (
    <details className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-2">
      <summary className="cursor-pointer text-xs font-medium text-sky-700">Update route truth</summary>
      <form className="mt-3 grid gap-2" onSubmit={save}>
        <label className="text-xs font-medium text-slate-600">Status
          <Select className="mt-1" name="routeStatus" defaultValue={route.route_status}>
            <option value="unknown">Unknown</option><option value="researching">Researching</option><option value="contact_identified">Contact identified</option>
            {canConfirm ? <option value="contacted">Contacted</option> : null}{canConfirm ? <option value="prequalification">Prequalification</option> : null}
            {canConfirm ? <option value="confirmed">Confirmed</option> : null}{canConfirm ? <option value="approved">Approved</option> : null}
            {canConfirm ? <option value="blocked">Blocked</option> : null}{canConfirm ? <option value="rejected">Rejected</option> : null}
            {canConfirm ? <option value="dormant">Dormant</option> : null}
          </Select>
        </label>
        <label className="text-xs font-medium text-slate-600">Evidence summary<Textarea className="mt-1 min-h-20" name="evidenceSummary" defaultValue={route.evidence_summary ?? ""} /></label>
        <label className="text-xs font-medium text-slate-600">Onboarding requirements<Textarea className="mt-1 min-h-20" name="onboardingRequirements" defaultValue={route.onboarding_requirements ?? ""} /></label>
        <label className="text-xs font-medium text-slate-600">Next action<Input className="mt-1" name="nextAction" defaultValue={route.next_action ?? ""} /></label>
        <label className="text-xs font-medium text-slate-600">Due<Input className="mt-1" name="nextActionDueAt" type="datetime-local" defaultValue={localDateTime(route.next_action_due_at)} /></label>
        <div className="flex items-center gap-2"><Button disabled={saving}>{saving ? "Saving…" : "Update route"}</Button>{message ? <span className="text-xs text-slate-600">{message}</span> : null}</div>
      </form>
    </details>
  );
}

export function CommercialActionEditor({ action, canConfirm }: { action: CommercialActionRow; canConfirm: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = {
      status: String(form.get("status") ?? action.status),
      recipientName: String(form.get("recipientName") ?? ""),
      recipientEmail: String(form.get("recipientEmail") ?? ""),
      recipientCompany: String(form.get("recipientCompany") ?? ""),
      subject: String(form.get("subject") ?? ""),
      finalContent: String(form.get("finalContent") ?? ""),
      occurredAt: iso(form.get("occurredAt")),
      followUpAt: iso(form.get("followUpAt")),
      responseSummary: String(form.get("responseSummary") ?? ""),
      objection: String(form.get("objection") ?? ""),
      outcome: String(form.get("outcome") ?? ""),
      nextAction: String(form.get("nextAction") ?? ""),
      nextActionDueAt: iso(form.get("nextActionDueAt")),
    };
    setSaving(true); setMessage("");
    try {
      const response = await fetch(`/api/commercial/actions/${action.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) { setMessage(result.error ?? "Could not update action."); return; }
      setMessage("Action updated."); router.refresh();
    } finally { setSaving(false); }
  }

  return (
    <details className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-2">
      <summary className="cursor-pointer text-xs font-medium text-sky-700">Update action, response, or outcome</summary>
      <form className="mt-3 grid gap-2" onSubmit={save}>
        <label className="text-xs font-medium text-slate-600">Status<Select className="mt-1" name="status" defaultValue={action.status}>
          <option value="draft">Draft</option><option value="planned">Planned</option>
          {canConfirm ? <option value="completed">Completed</option> : null}{canConfirm ? <option value="responded">Responded</option> : null}
          {canConfirm ? <option value="no_response">No response</option> : null}<option value="cancelled">Cancelled</option>
        </Select></label>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-xs font-medium text-slate-600">Recipient<Input className="mt-1" name="recipientName" defaultValue={action.recipient_name ?? ""} /></label>
          <label className="text-xs font-medium text-slate-600">Email<Input className="mt-1" name="recipientEmail" type="email" defaultValue={action.recipient_email ?? ""} /></label>
          <label className="text-xs font-medium text-slate-600">Company<Input className="mt-1" name="recipientCompany" defaultValue={action.recipient_company ?? ""} /></label>
        </div>
        <label className="text-xs font-medium text-slate-600">Subject<Input className="mt-1" name="subject" defaultValue={action.subject ?? ""} /></label>
        <label className="text-xs font-medium text-slate-600">Final content / precise action record<Textarea className="mt-1 min-h-28" name="finalContent" defaultValue={action.final_content ?? ""} /></label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-medium text-slate-600">Occurred<Input className="mt-1" name="occurredAt" type="datetime-local" defaultValue={localDateTime(action.occurred_at)} /></label>
          <label className="text-xs font-medium text-slate-600">Follow-up<Input className="mt-1" name="followUpAt" type="datetime-local" defaultValue={localDateTime(action.follow_up_at)} /></label>
        </div>
        <label className="text-xs font-medium text-slate-600">Response summary<Textarea className="mt-1 min-h-20" name="responseSummary" defaultValue={action.response_summary ?? ""} /></label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-medium text-slate-600">Objection<Input className="mt-1" name="objection" defaultValue={action.objection ?? ""} /></label>
          <label className="text-xs font-medium text-slate-600">Outcome<Input className="mt-1" name="outcome" defaultValue={action.outcome ?? ""} /></label>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-medium text-slate-600">Next action<Input className="mt-1" name="nextAction" defaultValue={action.next_action ?? ""} /></label>
          <label className="text-xs font-medium text-slate-600">Next due<Input className="mt-1" name="nextActionDueAt" type="datetime-local" defaultValue={localDateTime(action.next_action_due_at)} /></label>
        </div>
        <div className="flex items-center gap-2"><Button disabled={saving}>{saving ? "Saving…" : "Update action record"}</Button>{message ? <span className="text-xs text-slate-600">{message}</span> : null}</div>
      </form>
    </details>
  );
}
