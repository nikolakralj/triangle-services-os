import Link from "next/link";
import { Banknote, CalendarDays, FileCheck2, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { DeliveryOrderCreate } from "@/components/modules/delivery-order-create";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { listDeliveryOrders, listOrderCreationOptions } from "@/lib/data/delivery";

export const dynamic = "force-dynamic";

function intent(status: string) {
  if (["signed", "active", "completed"].includes(status)) return "success" as const;
  if (["terminated", "cancelled"].includes(status)) return "danger" as const;
  return "warning" as const;
}

export default async function DeliveryPage() {
  const session = await getSession();
  if (!session?.organizationId) return <PageHeader title="Delivery & margin" description="Organization context is required." />;
  const [orders, creationOptions] = await Promise.all([
    listDeliveryOrders(session.organizationId),
    listOrderCreationOptions(session.organizationId),
  ]);
  const canManage = session.role === "admin" || session.role === "partner";

  return (
    <>
      <PageHeader
        title="Delivery & margin"
        description="Agreement truth, worker commitments, mobilization, approved time, invoices, cash, costs, and contribution."
      />
      {canManage ? <div className="mb-4"><DeliveryOrderCreate options={creationOptions} /></div> : null}
      <div className="space-y-3">
        {orders.map((order) => (
          <Link key={order.id} href={`/delivery/${order.id}`}>
            <Card className="transition hover:border-sky-300 hover:shadow-md">
              <CardContent className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-slate-950">{order.title}</h2><Badge intent={intent(order.status)}>{order.status}</Badge><Badge>{order.order_type}</Badge></div>
                  <p className="mt-1 text-sm text-slate-600">{order.requirementTitle}</p>
                  <p className="mt-2 text-xs text-slate-500">{order.buyer_contracting_entity || "buyer entity missing"} · {order.external_reference || "reference missing"} · {order.start_date || "start missing"}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 lg:min-w-72">
                  <span className="flex items-center gap-1"><UsersRound className="h-3.5 w-3.5" /> {order.reservationCount} reservations / {order.mobilizationCount} mobilizations</span>
                  <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> {order.approvedTimesheetCount} approved timesheets</span>
                  <span className="flex items-center gap-1"><FileCheck2 className="h-3.5 w-3.5" /> {order.invoiceCount} invoices</span>
                  <span className="flex items-center gap-1"><Banknote className="h-3.5 w-3.5" /> {order.financial.cash_contribution.toLocaleString()} {order.currency} cash contribution</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
        {orders.length === 0 ? <Card><CardContent className="py-10 text-center"><p className="font-medium text-slate-800">No orders or agreements recorded</p><p className="mt-1 text-sm text-slate-500">A match or “placed” label is not an order. Start only from a qualified requirement with a real contracting route.</p></CardContent></Card> : null}
      </div>
    </>
  );
}
