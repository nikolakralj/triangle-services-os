import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { DeliveryCrewPanel } from "@/components/modules/delivery-crew-panel";
import { DeliveryFinancePanel } from "@/components/modules/delivery-finance-panel";
import { DeliveryOrderEditor } from "@/components/modules/delivery-order-editor";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { getDeliveryWorkspace } from "@/lib/data/delivery";

export const dynamic = "force-dynamic";

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function statusIntent(status: string) {
  if (["signed", "active", "completed", "confirmed", "ready", "mobilized", "paid", "client_approved", "invoiced"].includes(status)) {
    return "success" as const;
  }
  if (["terminated", "cancelled", "blocked", "rejected", "void", "disputed"].includes(status)) {
    return "danger" as const;
  }
  return "warning" as const;
}

function Metric({
  label,
  value,
  caution = false,
}: {
  label: string;
  value: string;
  caution?: boolean;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className={caution ? "mt-1 text-xl font-bold text-rose-700" : "mt-1 text-xl font-bold text-slate-950"}>{value}</p>
      </CardContent>
    </Card>
  );
}

export default async function DeliveryOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session?.organizationId) notFound();
  const { id } = await params;
  const workspace = await getDeliveryWorkspace(id, session.organizationId);
  if (!workspace) notFound();

  const canManage = session.role === "admin" || session.role === "partner";
  const { order, financial } = workspace;
  const currency = order.currency;

  return (
    <>
      <PageHeader
        title={order.title}
        description={`${workspace.requirementTitle} · agreement, crew, delivery evidence, invoice, cash, and margin truth.`}
        actions={
          <div className="flex flex-wrap gap-3">
            <Link className="text-sm font-medium text-sky-700 hover:underline" href="/delivery">All delivery</Link>
            <Link className="text-sm font-medium text-sky-700 hover:underline" href={`/commercial/${order.requirement_id}`}>Open requirement</Link>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Badge intent={statusIntent(order.status)}>{order.status}</Badge>
        <Badge>{order.order_type}</Badge>
        <Badge intent={order.human_approved_at ? "success" : "warning"}>
          {order.human_approved_at ? "human approved" : "approval missing"}
        </Badge>
        <Badge intent={order.signed_at ? "success" : "warning"}>
          {order.signed_at ? "signed evidence recorded" : "not signed"}
        </Badge>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="Net invoiced" value={formatMoney(financial.net_invoiced, currency)} />
        <Metric label="Cash received" value={formatMoney(financial.cash_received, currency)} />
        <Metric label="Forecast cost" value={formatMoney(financial.forecast_cost, currency)} />
        <Metric label="Committed + actual" value={formatMoney(financial.committed_actual_cost, currency)} />
        <Metric label="Invoiced contribution" value={formatMoney(financial.invoiced_contribution, currency)} caution={financial.invoiced_contribution < 0} />
        <Metric label="Cash contribution" value={formatMoney(financial.cash_contribution, currency)} caution={financial.cash_contribution < 0} />
      </div>

      <Card className="mb-4">
        <CardHeader
          title="Order / agreement truth"
          description="Signed and active states require a qualified requirement, the linked confirmed buyer route, both legal entities, rate/payment terms, signed time, and human approval."
        />
        <CardContent>
          {canManage ? (
            <DeliveryOrderEditor order={order} buyerRoutes={workspace.buyerRoutes} />
          ) : (
            <div className="grid gap-3 text-sm text-slate-700 md:grid-cols-2">
              <p><strong>External reference:</strong> {order.external_reference ?? "Missing"}</p>
              <p><strong>Buyer entity:</strong> {order.buyer_contracting_entity ?? "Missing"}</p>
              <p><strong>Supplier entity:</strong> {order.supplier_legal_entity ?? "Missing"}</p>
              <p><strong>Payment terms:</strong> {order.payment_terms_days === null ? "Missing" : `${order.payment_terms_days} days`}</p>
              <p className="md:col-span-2"><strong>Scope:</strong> {order.scope_summary ?? "Missing"}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader
          title="Crew reservation and mobilization"
          description="Holds prevent double-booking. Ready/mobilized states require a confirmed reservation, signed order, complete readiness checklist, and human confirmation."
        />
        <CardContent>
          {canManage ? (
            <DeliveryCrewPanel
              orderId={order.id}
              reservations={workspace.reservations}
              mobilizations={workspace.mobilizations}
              checklist={workspace.checklist}
              workers={workspace.workers}
              documents={workspace.documents}
            />
          ) : (
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-slate-900">Reservations</h3>
                {workspace.reservations.map((item) => (
                  <p key={item.id} className="mt-2 text-sm text-slate-700">
                    {item.workerName ?? "Worker"} · {item.start_date}–{item.end_date} · <Badge intent={statusIntent(item.status)}>{item.status}</Badge>
                  </p>
                ))}
                {workspace.reservations.length === 0 ? <p className="mt-2 text-sm text-slate-500">No reservations.</p> : null}
              </div>
              <div>
                <h3 className="font-medium text-slate-900">Mobilizations</h3>
                {workspace.mobilizations.map((item) => (
                  <p key={item.id} className="mt-2 text-sm text-slate-700">
                    {item.workerName ?? "Worker"} · start {item.planned_start_date} · <Badge intent={statusIntent(item.status)}>{item.status}</Badge>
                  </p>
                ))}
                {workspace.mobilizations.length === 0 ? <p className="mt-2 text-sm text-slate-500">No mobilizations.</p> : null}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Time, invoices, cash, and cost"
          description="Client-approved time supports invoices; recorded payments and actual costs produce contribution truth."
        />
        <CardContent>
          {canManage ? (
            <DeliveryFinancePanel
              orderId={order.id}
              currency={currency}
              mobilizations={workspace.mobilizations}
              timesheets={workspace.timesheets}
              invoicedTimesheetIds={workspace.invoicedTimesheetIds}
              invoices={workspace.invoices}
              payments={workspace.payments}
              costs={workspace.costs}
              workers={workspace.workers}
            />
          ) : (
            <div className="grid gap-4 text-sm text-slate-700 md:grid-cols-3">
              <div><strong>{workspace.timesheets.length}</strong><br />timesheets</div>
              <div><strong>{workspace.invoices.length}</strong><br />invoices</div>
              <div><strong>{workspace.payments.length}</strong><br />payments</div>
              <div className="md:col-span-3"><strong>{workspace.costs.length}</strong> cost records. Financial values are shown above.</div>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Triangle OS records evidence and human decisions. It does not sign agreements, approve legal status, submit timesheets, issue invoices, or move money automatically.
      </p>
    </>
  );
}
