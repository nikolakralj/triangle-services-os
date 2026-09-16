import { ago } from "@/lib/data/mission-shared";
import type { AgentRun } from "@/lib/data/agents";

// Settings → Diagnostics → Work log. Each agent run as one sentence. Moved
// here from Workforce (DEV-012): it is a machine record for whoever maintains
// Triangle, not a place where a business decision is made.

export interface WorkLogEmployee {
  badgeName: string;
  displayName: string;
  emoji: string;
}

export function describeRun(run: AgentRun, who: string): string {
  const n = (k: string) => Number(run.summary[k] ?? 0);
  if (run.source === "ingest") {
    const bits: string[] = [];
    if (n("opportunities") > 0)
      bits.push(
        `${n("opportunities")} new ${n("opportunities") === 1 ? "opportunity" : "opportunities"}`,
      );
    if (n("alreadySeen") > 0) bits.push(`${n("alreadySeen")} already known`);
    if (n("noiseDiscarded") > 0) bits.push(`${n("noiseDiscarded")} noise skipped`);
    if (n("errors") > 0) bits.push(`${n("errors")} errors`);
    return `${who} handed in ${n("received")} emails — ${bits.join(", ") || "nothing new"}.`;
  }
  if (run.source === "imap") {
    const bits: string[] = [];
    if (n("leadsCreated") > 0) bits.push(`${n("leadsCreated")} new leads`);
    if (n("alreadySeen") > 0) bits.push(`${n("alreadySeen")} already known`);
    if (n("errors") > 0) bits.push(`${n("errors")} errors`);
    return `Mailbox check read ${n("fetched")} emails — ${bits.join(", ") || "nothing new"}.`;
  }
  return `${who}: ${Object.entries(run.summary)
    .filter(([, v]) => typeof v !== "object")
    .map(([k, v]) => `${k} ${String(v)}`)
    .join(", ")}`;
}

export function WorkLog({
  runs,
  employees,
}: {
  runs: AgentRun[];
  /** Badge name → who that is, so a run reads as a person, not a credential. */
  employees: WorkLogEmployee[];
}) {
  const byBadge = new Map(employees.map((e) => [e.badgeName, e]));
  const face = (badge: string) => byBadge.get(badge)?.emoji ?? "🤖";
  const called = (badge: string) => byBadge.get(badge)?.displayName ?? badge;

  if (runs.length === 0) {
    return (
      <p className="text-[13px] text-slate-500">
        No runs recorded yet. Finished work shows up here on its own.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
      {runs.map((r, i) => (
        <li
          key={`${r.agentName}-${r.createdAt}-${i}`}
          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
        >
          <p className="flex min-w-0 items-center gap-2 text-[13px] text-slate-700">
            <span className="text-base leading-none" aria-hidden>
              {face(r.agentName)}
            </span>
            {describeRun(r, called(r.agentName))}
          </p>
          <p className="shrink-0 text-[11.5px] text-slate-400" suppressHydrationWarning>
            {ago(r.createdAt)}
          </p>
        </li>
      ))}
    </ul>
  );
}
