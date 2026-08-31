"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import type { MobilizationChecklistRow, MobilizationRow, ReservationRow } from "@/lib/data/delivery";

type WorkerOption = { id: string; full_name: string; role: string; availability_status: string };

async function mutate(body: Record<string, unknown>) {
  const response = await fetch("/api/delivery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(result.error ?? "Delivery update failed.");
}

function iso(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim(); return text ? new Date(text).toISOString() : undefined;
}

export function DeliveryCrewPanel({
  orderId, currency, reservations, mobilizations, checklist, workers,
}: {
  orderId: string; currency: string; reservations: ReservationRow[]; mobilizations: MobilizationRow[];
  checklist: MobilizationChecklistRow[]; workers: WorkerOption[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function run(body: Record<string, unknown>) {
    setSaving(true); setMessage("");
    try { await mutate(body); setMessage("Delivery record updated."); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Update failed."); }
    finally { setSaving(false); }
  }

  async function createReservation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await run({ operation: "create_reservation", orderId, workerId: form.get("workerId"), status: form.get("status"),
      startDate: form.get("startDate"), endDate: form.get("endDate"), confirmationSource: form.get("confirmationSource"), notes: form.get("notes") });
  }
  async function createMobilization(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const reservation = reservations.find((item) => item.id === form.get("reservationId"));
    if (!reservation) return;
    await run({ operation: "create_mobilization", orderId, reservationId: reservation.id, workerId: reservation.worker_id,
      plannedStartDate: form.get("plannedStartDate"), plannedEndDate: form.get("plannedEndDate") || undefined,
      siteLocation: form.get("siteLocation"), siteContact: form.get("siteContact"), supervisorName: form.get("supervisorName"),
      nextAction: form.get("nextAction"), nextActionDueAt: iso(form.get("nextActionDueAt")) });
  }

  return (
    <div className="space-y-4">
      {message ? <p className={message.endsWith("updated.") ? "text-sm text-emerald-700" : "text-sm text-rose-700"} role="status">{message}</p> : null}
      <div className="grid gap-4 xl:grid-cols-2">
        <form className="grid gap-2 rounded-md border border-slate-200 p-3" onSubmit={createReservation}>
          <h3 className="font-medium text-slate-900">Reserve a real worker</h3>
          <label className="text-xs font-medium text-slate-600">Worker<Select className="mt-1" name="workerId" required>
            {workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.full_name} — {worker.role} [{worker.availability_status}]</option>)}
          </Select></label>
          <label className="text-xs font-medium text-slate-600">Commitment state<Select className="mt-1" name="status" defaultValue="hold"><option value="hold">Hold (still blocks overlap)</option><option value="reserved">Reserved — human confirmed</option><option value="confirmed">Confirmed for order</option></Select></label>
          <div className="grid grid-cols-2 gap-2"><label className="text-xs font-medium text-slate-600">Start<Input className="mt-1" name="startDate" type="date" required /></label><label className="text-xs font-medium text-slate-600">End<Input className="mt-1" name="endDate" type="date" required /></label></div>
          <label className="text-xs font-medium text-slate-600">Human confirmation source<Input className="mt-1" name="confirmationSource" placeholder="Phone call with worker on 2026-08-31" /></label>
          <label className="text-xs font-medium text-slate-600">Notes<Textarea className="mt-1 min-h-20" name="notes" /></label>
          <Button disabled={saving || workers.length === 0}>Create reservation</Button>
          <p className="text-xs text-slate-500">Overlapping holds/reservations for the same worker are rejected by the database.</p>
        </form>
        <form className="grid gap-2 rounded-md border border-slate-200 p-3" onSubmit={createMobilization}>
          <h3 className="font-medium text-slate-900">Create mobilization</h3>
          <label className="text-xs font-medium text-slate-600">Reservation<Select className="mt-1" name="reservationId" required>
            {reservations.filter((item) => ["reserved", "confirmed"].includes(item.status)).map((item) => <option key={item.id} value={item.id}>{item.workerName} · {item.start_date}–{item.end_date}</option>)}
          </Select></label>
          <div className="grid grid-cols-2 gap-2"><label className="text-xs font-medium text-slate-600">Planned start<Input className="mt-1" name="plannedStartDate" type="date" required /></label><label className="text-xs font-medium text-slate-600">Planned end<Input className="mt-1" name="plannedEndDate" type="date" /></label></div>
          <label className="text-xs font-medium text-slate-600">Site<Input className="mt-1" name="siteLocation" /></label>
          <label className="text-xs font-medium text-slate-600">Site contact<Input className="mt-1" name="siteContact" /></label>
          <label className="text-xs font-medium text-slate-600">Supervisor<Input className="mt-1" name="supervisorName" /></label>
          <label className="text-xs font-medium text-slate-600">Next action<Input className="mt-1" name="nextAction" /></label>
          <label className="text-xs font-medium text-slate-600">Due<Input className="mt-1" name="nextActionDueAt" type="datetime-local" /></label>
          <Button disabled={saving || reservations.every((item) => !["reserved", "confirmed"].includes(item.status))}>Create planned mobilization</Button>
        </form>
      </div>

      <div className="space-y-3">
        <h3 className="font-medium text-slate-900">Reservations</h3>
        {reservations.map((reservation) => (
          <form key={reservation.id} className="grid gap-2 rounded-md border border-slate-200 p-3 lg:grid-cols-[1fr_180px_1fr_auto] lg:items-end" onSubmit={(event) => {
            event.preventDefault(); const form = new FormData(event.currentTarget); run({ operation: "update_reservation", reservationId: reservation.id, status: form.get("status"), confirmationSource: form.get("confirmationSource"), notes: reservation.notes ?? undefined });
          }}>
            <div><p className="font-medium text-slate-900">{reservation.workerName}</p><p className="text-xs text-slate-500">{reservation.start_date}–{reservation.end_date} · {currency}</p></div>
            <label className="text-xs font-medium text-slate-600">Status<Select className="mt-1" name="status" defaultValue={reservation.status}><option value="hold">Hold</option><option value="reserved">Reserved</option><option value="confirmed">Confirmed</option><option value="released">Released</option><option value="cancelled">Cancelled</option></Select></label>
            <label className="text-xs font-medium text-slate-600">Confirmation source<Input className="mt-1" name="confirmationSource" defaultValue={reservation.confirmation_source ?? ""} /></label>
            <Button disabled={saving}>Update</Button>
          </form>
        ))}
        {reservations.length === 0 ? <p className="text-sm text-slate-500">No workers held or reserved.</p> : null}
      </div>

      <div className="space-y-3">
        <h3 className="font-medium text-slate-900">Mobilizations and readiness</h3>
        {mobilizations.map((mobilization) => {
          const items = checklist.filter((item) => item.mobilization_id === mobilization.id);
          return (
            <div key={mobilization.id} className="rounded-md border border-slate-200 p-3">
              <div className="flex flex-wrap items-center gap-2"><p className="font-medium text-slate-900">{mobilization.workerName}</p><Badge>{mobilization.status}</Badge><span className="text-xs text-slate-500">start {mobilization.planned_start_date}</span></div>
              <form className="mt-3 grid gap-2 lg:grid-cols-[180px_1fr_1fr_auto] lg:items-end" onSubmit={(event) => {
                event.preventDefault(); const form = new FormData(event.currentTarget); run({ operation: "update_mobilization", mobilizationId: mobilization.id, status: form.get("status"), blockerSummary: form.get("blockerSummary"), nextAction: form.get("nextAction"), nextActionDueAt: iso(form.get("nextActionDueAt")) });
              }}>
                <label className="text-xs font-medium text-slate-600">State<Select className="mt-1" name="status" defaultValue={mobilization.status}><option value="planned">Planned</option><option value="blocked">Blocked</option><option value="ready">Ready</option><option value="mobilized">Mobilized</option><option value="active">Active</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></Select></label>
                <label className="text-xs font-medium text-slate-600">Blocker<Input className="mt-1" name="blockerSummary" defaultValue={mobilization.blocker_summary ?? ""} /></label>
                <label className="text-xs font-medium text-slate-600">Next action<Input className="mt-1" name="nextAction" defaultValue={mobilization.next_action ?? ""} /></label>
                <Button disabled={saving}>Update state</Button>
              </form>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {items.map((item) => (
                  <form key={item.id} className="grid grid-cols-[1fr_140px_auto] items-end gap-2 rounded bg-slate-50 p-2" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); run({ operation: "update_mobilization_checklist", checklistItemId: item.id, status: form.get("status"), notes: item.notes ?? undefined }); }}>
                    <p className="text-xs font-medium text-slate-700">{item.label}</p>
                    <Select name="status" defaultValue={item.status}><option value="missing">Missing</option><option value="in_progress">In progress</option><option value="ready">Ready</option><option value="not_required">Not required</option><option value="blocked">Blocked</option></Select>
                    <Button disabled={saving}>Save</Button>
                  </form>
                ))}
              </div>
            </div>
          );
        })}
        {mobilizations.length === 0 ? <p className="text-sm text-slate-500">No mobilization records.</p> : null}
      </div>
    </div>
  );
}
