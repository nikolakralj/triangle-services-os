import { cn } from "@/lib/utils";

const intentClasses = {
  neutral: "border-slate-200 bg-slate-100 text-slate-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  purple: "border-violet-200 bg-violet-50 text-violet-700",
};

export function Badge({
  children,
  intent = "neutral",
  className,
}: {
  children: React.ReactNode;
  intent?: keyof typeof intentClasses;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        intentClasses[intent],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function priorityIntent(priority?: string) {
  if (priority === "critical") return "danger";
  if (priority === "high") return "warning";
  if (priority === "medium") return "neutral";
  return "info";
}
