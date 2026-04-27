import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  helper,
  icon,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  helper?: string;
  icon?: React.ReactNode;
  tone?: "slate" | "sky" | "emerald" | "amber" | "rose" | "violet";
}) {
  const colors = {
    slate: "bg-slate-100 text-slate-700",
    sky: "bg-sky-100 text-sky-700",
    emerald: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    rose: "bg-rose-100 text-rose-700",
    violet: "bg-violet-100 text-violet-700",
  };
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
          {helper ? (
            <p className="mt-1 text-xs text-slate-500">{helper}</p>
          ) : null}
        </div>
        {icon ? (
          <div className={cn("rounded-md p-2", colors[tone])}>{icon}</div>
        ) : null}
      </div>
    </Card>
  );
}
