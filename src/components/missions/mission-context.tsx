"use client";

import Link from "next/link";
import { Building2, Forward } from "lucide-react";
import {
  holdingDeepLink,
  missionHasContext,
  missionStepAnchor,
  type MissionContext,
} from "@/lib/data/mission-shared";
import { MissionMark } from "@/components/missions/mission-state";

// ---------------------------------------------------------------------------
// Cross-employee context, as chips on the mission the CEO already has open.
//
// Hanna cited Scout's PMS and Rösler doors with no way back to Scout's ask,
// Scout's mission, or the records. That is a scavenger hunt, not a handoff.
// These chips are the smallest fix: the request, the source mission, the door.
// Not a second inbox.
// ---------------------------------------------------------------------------

const REQUEST_STATUS: Record<string, string> = {
  queued: "Waiting",
  active: "Working",
  waiting_review: "Needs you",
  completed: "Returned",
  failed: "Could not",
  cancelled: "Cancelled",
};

export function MissionContextChips({
  context,
}: {
  context: MissionContext;
}) {
  if (!missionHasContext(context)) return null;

  return (
    <div className="mt-3">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        Also on this case
      </p>
      <ul className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {context.requests.map((r) => {
          const status = REQUEST_STATUS[r.status] ?? r.status;
          const title = r.headline ? `${r.title} — ${r.headline}` : r.title;
          return (
            <li key={r.assignmentId}>
              <Link
                href={`#${missionStepAnchor(r.assignmentId)}`}
                title={`${r.askedBy} asked ${r.askedOf}: ${title}`}
                className="inline-flex max-w-[22rem] items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-[12px] font-medium text-sky-800 ring-1 ring-inset ring-sky-200 transition hover:bg-sky-100"
              >
                <Forward className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  Asked {r.askedOf}
                  <span className="font-normal text-sky-700"> · {r.title}</span>
                </span>
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.06em] text-sky-600">
                  {status}
                </span>
              </Link>
            </li>
          );
        })}
        {context.sourceMissions.map((m) => (
          <li key={m.missionId}>
            <Link
              href={`/missions/${m.missionId}`}
              title={`Opened from ${m.title}`}
              className="inline-flex max-w-[18rem] items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[12px] font-medium text-slate-700 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-200/80"
            >
              <MissionMark emoji={m.emoji} size="sm" />
              <span className="truncate">From {m.title}</span>
            </Link>
          </li>
        ))}
        {context.holdings.map((h) => (
          <li key={h.companyId}>
            <Link
              href={holdingDeepLink(h)}
              title={`Open ${h.name}`}
              className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[12px] font-medium text-slate-800 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50"
            >
              <Building2 className="h-3 w-3 shrink-0 text-slate-500" />
              <span className="truncate">{h.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
