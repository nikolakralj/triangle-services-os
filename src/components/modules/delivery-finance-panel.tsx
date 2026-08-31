"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import type {
  DeliveryCostRow,
  InvoiceRow,
  MobilizationRow,
  PaymentRow,
  TimesheetRow,
} from "@/lib/data/delivery";

type WorkerOption = {
  id: string;
  full_name: string;
  role: string;
  availability_status: string;
};

type Notice = { tone: "success" | "error"; text: string } | null;

function optionalValue(form: FormData, key: string) {
  const value = String(form.get(key) ?? "").trim();
  return value || undefined;
}

function optionalNumber(form: FormData, key: string) {
  const value = optionalValue(form, key);
  return value === undefined ? undefined : Number(value);
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function statusIntent(status: string) {
  if (["client_approved", "invoiced", "paid", "actual"].includes(status)) return "success" as const;
  if (["rejected", "disputed", "void"].includes(status)) return "danger" as const;
  return "warning" as const;
}

async function mutate(body: Record<string, unknown>) {
  const response = await fetch("/api/delivery", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(result.error ?? "Delivery update failed.");
}

export function DeliveryFinancePanel({
  orderId,
  currency,
  mobilizations,
  timesheets,
  invoicedTimesheetIds,
  invoices,
  payments,
  costs,
  workers,
}: {
  orderId: string;
  currency: string;
  mobilizations: MobilizationRow[];
  timesheets: TimesheetRow[];
  invoicedTimesheetIds: string[];
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  costs: DeliveryCostRow[];
  workers: WorkerOption[];
}) {
  const router = useRouter();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  async function run(key: string, body: Record<string, unknown>) {
    setSavingKey(key);
    setNotice(null);
    try {
      await mutate(body);
      setNotice({ tone: "success", text: "Delivery economics updated." });
      router.refresh();
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Update failed.",
      });
    } finally {
      setSavingKey(null);
    }
  }

  async function createTimesheet(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const mobilization = mobilizations.find(
      (item) => item.id === form.get("mobilizationId"),
    );
    if (!mobilization) {
      setNotice({ tone: "error", text: "Choose a mobilized worker." });
      return;
    }
    await run("timesheet-new", {
      operation: "create_timesheet",
      orderId,
      mobilizationId: mobilization.id,
      workerId: mobilization.worker_id,
      periodStart: form.get("periodStart"),
      periodEnd: form.get("periodEnd"),
      regularHours: form.get("regularHours"),
      overtimeHours: form.get("overtimeHours"),
      billRate: optionalNumber(form, "billRate"),
      costRate: optionalNumber(form, "costRate"),
      currency,
      status: form.get("status"),
      clientApproverName: optionalValue(form, "clientApproverName"),
      clientApprovalEvidence: optionalValue(form, "clientApprovalEvidence"),
      notes: optionalValue(form, "notes"),
    });
  }

  async function createInvoice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run("invoice-new", {
      operation: "create_invoice",
      orderId,
      invoiceNumber: form.get("invoiceNumber"),
      status: form.get("status"),
      issueDate: optionalValue(form, "issueDate"),
      dueDate: optionalValue(form, "dueDate"),
      currency,
      netAmount: form.get("netAmount"),
      taxAmount: form.get("taxAmount"),
      timesheetIds: form.getAll("timesheetIds").map(String),
      notes: optionalValue(form, "notes"),
    });
  }

  async function createCost(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run("cost-new", {
      operation: "record_cost",
      orderId,
      mobilizationId: optionalValue(form, "mobilizationId"),
      workerId: optionalValue(form, "workerId"),
      costType: form.get("costType"),
      costState: form.get("costState"),
      costDate: optionalValue(form, "costDate"),
      amount: form.get("amount"),
      currency,
      description: optionalValue(form, "description"),
    });
  }

  const eligibleTimesheets = timesheets.filter(
    (item) =>
      item.status === "client_approved" &&
      !invoicedTimesheetIds.includes(item.id),
  );
  const workableMobilizations = mobilizations.filter((item) =>
    ["mobilized", "active", "completed"].includes(item.status),
  );
  const workerById = new Map(workers.map((worker) => [worker.id, worker]));

  return (
    <div className="space-y-6">
      {notice ? (
        <p
          role="status"
          className={notice.tone === "success" ? "text-sm text-emerald-700" : "text-sm text-rose-700"}
        >
          {notice.text}
        </p>
      ) : null}

      <section className="space-y-3">
        <h3 className="font-semibold text-slate-950">1. Approved delivery time</h3>
        <form className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 lg:grid-cols-4" onSubmit={createTimesheet}>
          <label className="text-xs font-medium text-slate-700 lg:col-span-2">
            Mobilized worker
            <Select className="mt-1" name="mobilizationId" required>
              {workableMobilizations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.workerName ?? workerById.get(item.worker_id)?.full_name ?? "Worker"} [{item.status}]
                </option>
              ))}
            </Select>
          </label>
          <label className="text-xs font-medium text-slate-700">
            Period start<Input className="mt-1" name="periodStart" type="date" required />
          </label>
          <label className="text-xs font-medium text-slate-700">
            Period end<Input className="mt-1" name="periodEnd" type="date" required />
          </label>
          <label className="text-xs font-medium text-slate-700">
            Regular hours<Input className="mt-1" name="regularHours" type="number" min={0} step="0.25" required />
          </label>
          <label className="text-xs font-medium text-slate-700">
            Overtime hours<Input className="mt-1" name="overtimeHours" type="number" min={0} step="0.25" defaultValue={0} />
          </label>
          <label className="text-xs font-medium text-slate-700">
            Bill rate<Input className="mt-1" name="billRate" type="number" min={0} step="0.01" />
          </label>
          <label className="text-xs font-medium text-slate-700">
            Cost rate<Input className="mt-1" name="costRate" type="number" min={0} step="0.01" />
          </label>
          <label className="text-xs font-medium text-slate-700">
            State
            <Select className="mt-1" name="status" defaultValue="draft">
              <option value="draft">Draft</option>
              <option value="submitted">Submitted to client</option>
              <option value="client_approved">Client approved</option>
            </Select>
          </label>
          <label className="text-xs font-medium text-slate-700">
            Client approver<Input className="mt-1" name="clientApproverName" />
          </label>
          <label className="text-xs font-medium text-slate-700 lg:col-span-2">
            Approval evidence<Input className="mt-1" name="clientApprovalEvidence" placeholder="Email/thread/document reference" />
          </label>
          <label className="text-xs font-medium text-slate-700 lg:col-span-4">
            Notes<Textarea className="mt-1" name="notes" />
          </label>
          <Button className="lg:col-span-4" disabled={savingKey !== null || workableMobilizations.length === 0}>
            {savingKey === "timesheet-new" ? "Saving…" : "Add timesheet"}
          </Button>
        </form>

        {timesheets.map((timesheet) => (
          <form
            key={timesheet.id}
            className="grid gap-2 rounded-lg border border-slate-200 p-3 lg:grid-cols-[1fr_170px_1fr_1fr_auto] lg:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void run(`timesheet-${timesheet.id}`, {
                operation: "update_timesheet",
                timesheetId: timesheet.id,
                status: form.get("status"),
                clientApproverName: optionalValue(form, "clientApproverName"),
                clientApprovalEvidence: optionalValue(form, "clientApprovalEvidence"),
                rejectionReason: optionalValue(form, "rejectionReason"),
                notes: optionalValue(form, "notes"),
              });
            }}
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-slate-900">{timesheet.workerName ?? "Worker"}</p>
                <Badge intent={statusIntent(timesheet.status)}>{timesheet.status}</Badge>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {timesheet.period_start}–{timesheet.period_end} · {Number(timesheet.regular_hours) + Number(timesheet.overtime_hours)} hours
              </p>
            </div>
            <label className="text-xs font-medium text-slate-700">
              State
              <Select className="mt-1" name="status" defaultValue={timesheet.status} disabled={timesheet.status === "invoiced"}>
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="client_approved">Client approved</option>
                <option value="rejected">Rejected</option>
                {timesheet.status === "invoiced" ? <option value="invoiced">Invoiced</option> : null}
              </Select>
            </label>
            <label className="text-xs font-medium text-slate-700">
              Approver<Input className="mt-1" name="clientApproverName" defaultValue={timesheet.client_approver_name ?? ""} disabled={timesheet.status === "invoiced"} />
            </label>
            <label className="text-xs font-medium text-slate-700">
              Evidence<Input className="mt-1" name="clientApprovalEvidence" defaultValue={timesheet.client_approval_evidence ?? ""} disabled={timesheet.status === "invoiced"} />
            </label>
            <Button disabled={savingKey !== null || timesheet.status === "invoiced"}>
              {savingKey === `timesheet-${timesheet.id}` ? "Saving…" : "Update"}
            </Button>
          </form>
        ))}
        {timesheets.length === 0 ? <p className="text-sm text-slate-500">No time recorded yet.</p> : null}
      </section>

      <section className="space-y-3 border-t border-slate-200 pt-5">
        <h3 className="font-semibold text-slate-950">2. Invoices and cash</h3>
        <form className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 lg:grid-cols-4" onSubmit={createInvoice}>
          <label className="text-xs font-medium text-slate-700 lg:col-span-2">
            Invoice number<Input className="mt-1" name="invoiceNumber" required />
          </label>
          <label className="text-xs font-medium text-slate-700">
            State
            <Select className="mt-1" name="status" defaultValue="draft">
              <option value="draft">Draft</option>
              <option value="issued">Issued</option>
              <option value="sent">Sent</option>
            </Select>
          </label>
          <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">Currency<br /><strong>{currency}</strong></div>
          <label className="text-xs font-medium text-slate-700">
            Issue date<Input className="mt-1" name="issueDate" type="date" />
          </label>
          <label className="text-xs font-medium text-slate-700">
            Due date<Input className="mt-1" name="dueDate" type="date" />
          </label>
          <label className="text-xs font-medium text-slate-700">
            Net amount<Input className="mt-1" name="netAmount" type="number" min={0} step="0.01" required />
          </label>
          <label className="text-xs font-medium text-slate-700">
            Tax amount<Input className="mt-1" name="taxAmount" type="number" min={0} step="0.01" defaultValue={0} />
          </label>
          <fieldset className="space-y-2 rounded-md border border-slate-200 bg-white p-3 lg:col-span-4">
            <legend className="px-1 text-xs font-semibold text-slate-700">Client-approved timesheets</legend>
            {eligibleTimesheets.map((timesheet) => (
              <label key={timesheet.id} className="flex items-center gap-2 text-xs text-slate-700">
                <input type="checkbox" name="timesheetIds" value={timesheet.id} />
                {timesheet.workerName ?? "Worker"} · {timesheet.period_start}–{timesheet.period_end}
              </label>
            ))}
            {eligibleTimesheets.length === 0 ? <p className="text-xs text-slate-500">No unbilled approved timesheets.</p> : null}
          </fieldset>
          <label className="text-xs font-medium text-slate-700 lg:col-span-4">
            Notes<Textarea className="mt-1" name="notes" />
          </label>
          <Button className="lg:col-span-4" disabled={savingKey !== null}>
            {savingKey === "invoice-new" ? "Saving…" : "Create invoice"}
          </Button>
        </form>

        {invoices.map((invoice) => {
          const invoicePayments = payments.filter((payment) => payment.invoice_id === invoice.id);
          const paid = invoicePayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
          const paymentManaged = ["part_paid", "paid"].includes(invoice.status);
          const canPay = ["sent", "part_paid", "overdue", "disputed"].includes(invoice.status);
          return (
            <div key={invoice.id} className="space-y-3 rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-slate-900">{invoice.invoice_number}</p>
                    <Badge intent={statusIntent(invoice.status)}>{invoice.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatMoney(invoice.total_amount, invoice.currency)} total · {formatMoney(paid, invoice.currency)} paid · due {invoice.due_date ?? "not set"}
                  </p>
                </div>
              </div>
              <form
                className="grid gap-2 lg:grid-cols-[180px_160px_160px_1fr_auto] lg:items-end"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  void run(`invoice-${invoice.id}`, {
                    operation: "update_invoice",
                    invoiceId: invoice.id,
                    status: form.get("status"),
                    issueDate: optionalValue(form, "issueDate"),
                    dueDate: optionalValue(form, "dueDate"),
                    disputeReason: optionalValue(form, "disputeReason"),
                    notes: optionalValue(form, "notes"),
                  });
                }}
              >
                <label className="text-xs font-medium text-slate-700">
                  State
                  <Select className="mt-1" name="status" defaultValue={invoice.status} disabled={paymentManaged}>
                    <option value="draft">Draft</option>
                    <option value="issued">Issued</option>
                    <option value="sent">Sent</option>
                    <option value="overdue">Overdue</option>
                    <option value="disputed">Disputed</option>
                    <option value="void">Void</option>
                    {paymentManaged ? <option value={invoice.status}>{invoice.status}</option> : null}
                  </Select>
                </label>
                <label className="text-xs font-medium text-slate-700">
                  Issue<Input className="mt-1" name="issueDate" type="date" defaultValue={invoice.issue_date ?? ""} disabled={paymentManaged} />
                </label>
                <label className="text-xs font-medium text-slate-700">
                  Due<Input className="mt-1" name="dueDate" type="date" defaultValue={invoice.due_date ?? ""} disabled={paymentManaged} />
                </label>
                <label className="text-xs font-medium text-slate-700">
                  Dispute / notes<Input className="mt-1" name="disputeReason" defaultValue={invoice.dispute_reason ?? ""} disabled={paymentManaged} />
                </label>
                <Button disabled={savingKey !== null || paymentManaged}>
                  {savingKey === `invoice-${invoice.id}` ? "Saving…" : "Update"}
                </Button>
              </form>
              {canPay ? (
                <form
                  className="grid gap-2 rounded-md bg-emerald-50 p-3 lg:grid-cols-[160px_160px_1fr_160px_auto] lg:items-end"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    void run(`payment-${invoice.id}`, {
                      operation: "record_payment",
                      invoiceId: invoice.id,
                      paymentDate: form.get("paymentDate"),
                      amount: form.get("amount"),
                      currency: invoice.currency,
                      paymentReference: optionalValue(form, "paymentReference"),
                      method: optionalValue(form, "method"),
                      notes: optionalValue(form, "notes"),
                    });
                  }}
                >
                  <label className="text-xs font-medium text-emerald-900">
                    Payment date<Input className="mt-1" name="paymentDate" type="date" required />
                  </label>
                  <label className="text-xs font-medium text-emerald-900">
                    Amount<Input className="mt-1" name="amount" type="number" min={0.01} max={Math.max(0, Number(invoice.total_amount) - paid)} step="0.01" required />
                  </label>
                  <label className="text-xs font-medium text-emerald-900">
                    Reference<Input className="mt-1" name="paymentReference" />
                  </label>
                  <label className="text-xs font-medium text-emerald-900">
                    Method<Input className="mt-1" name="method" placeholder="bank transfer" />
                  </label>
                  <Button disabled={savingKey !== null || paid >= Number(invoice.total_amount)}>
                    {savingKey === `payment-${invoice.id}` ? "Saving…" : "Record cash"}
                  </Button>
                </form>
              ) : null}
              {invoicePayments.length > 0 ? (
                <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                  {invoicePayments.map((payment) => (
                    <span key={payment.id} className="rounded bg-slate-100 px-2 py-1">
                      {payment.payment_date}: {formatMoney(payment.amount, payment.currency)} {payment.payment_reference ? `· ${payment.payment_reference}` : ""}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
        {invoices.length === 0 ? <p className="text-sm text-slate-500">No invoices recorded.</p> : null}
      </section>

      <section className="space-y-3 border-t border-slate-200 pt-5">
        <h3 className="font-semibold text-slate-950">3. Delivery costs</h3>
        <p className="text-xs text-slate-500">Move the same cost record from forecast to committed to actual so margin is not double-counted.</p>
        <form className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 lg:grid-cols-4" onSubmit={createCost}>
          <label className="text-xs font-medium text-slate-700">
            Type
            <Select className="mt-1" name="costType" defaultValue="labor">
              <option value="labor">Labor</option><option value="payroll_tax">Payroll tax</option><option value="travel">Travel</option>
              <option value="accommodation">Accommodation</option><option value="per_diem">Per diem</option><option value="ppe_tools">PPE / tools</option>
              <option value="training">Training</option><option value="insurance">Insurance</option><option value="admin">Admin</option>
              <option value="financing">Financing</option><option value="other">Other</option>
            </Select>
          </label>
          <label className="text-xs font-medium text-slate-700">
            State<Select className="mt-1" name="costState" defaultValue="forecast"><option value="forecast">Forecast</option><option value="committed">Committed</option><option value="actual">Actual</option></Select>
          </label>
          <label className="text-xs font-medium text-slate-700">
            Date<Input className="mt-1" name="costDate" type="date" />
          </label>
          <label className="text-xs font-medium text-slate-700">
            Amount<Input className="mt-1" name="amount" type="number" min={0} step="0.01" required />
          </label>
          <label className="text-xs font-medium text-slate-700 lg:col-span-2">
            Worker
            <Select className="mt-1" name="workerId" defaultValue="">
              <option value="">General order cost</option>
              {workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.full_name} — {worker.role}</option>)}
            </Select>
          </label>
          <label className="text-xs font-medium text-slate-700 lg:col-span-2">
            Mobilization
            <Select className="mt-1" name="mobilizationId" defaultValue="">
              <option value="">No mobilization link</option>
              {mobilizations.map((item) => <option key={item.id} value={item.id}>{item.workerName ?? "Worker"} · {item.planned_start_date}</option>)}
            </Select>
          </label>
          <label className="text-xs font-medium text-slate-700 lg:col-span-4">
            Description<Input className="mt-1" name="description" />
          </label>
          <Button className="lg:col-span-4" disabled={savingKey !== null}>
            {savingKey === "cost-new" ? "Saving…" : "Record cost"}
          </Button>
        </form>

        {costs.map((cost) => (
          <form
            key={cost.id}
            className="grid gap-2 rounded-lg border border-slate-200 p-3 lg:grid-cols-[1fr_140px_150px_150px_1fr_auto] lg:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void run(`cost-${cost.id}`, {
                operation: "update_cost",
                costId: cost.id,
                costState: form.get("costState"),
                costDate: optionalValue(form, "costDate"),
                amount: optionalNumber(form, "amount"),
                description: optionalValue(form, "description"),
              });
            }}
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-slate-900">{cost.description || cost.cost_type}</p>
                <Badge intent={statusIntent(cost.cost_state)}>{cost.cost_state}</Badge>
              </div>
              <p className="mt-1 text-xs text-slate-500">{cost.workerName ?? "Order-wide"} · {cost.cost_type}</p>
            </div>
            <label className="text-xs font-medium text-slate-700">
              State<Select className="mt-1" name="costState" defaultValue={cost.cost_state}><option value="forecast">Forecast</option><option value="committed">Committed</option><option value="actual">Actual</option></Select>
            </label>
            <label className="text-xs font-medium text-slate-700">
              Date<Input className="mt-1" name="costDate" type="date" defaultValue={cost.cost_date ?? ""} />
            </label>
            <label className="text-xs font-medium text-slate-700">
              Amount<Input className="mt-1" name="amount" type="number" min={0} step="0.01" defaultValue={cost.amount} />
            </label>
            <label className="text-xs font-medium text-slate-700">
              Description<Input className="mt-1" name="description" defaultValue={cost.description ?? ""} />
            </label>
            <Button disabled={savingKey !== null}>{savingKey === `cost-${cost.id}` ? "Saving…" : "Update"}</Button>
          </form>
        ))}
        {costs.length === 0 ? <p className="text-sm text-slate-500">No forecast, committed, or actual costs recorded.</p> : null}
      </section>
    </div>
  );
}
