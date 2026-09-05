"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Server,
  Factory,
  Wind,
  Hammer,
  Briefcase,
  Layers,
  Lock,
} from "lucide-react";
import type { Sector } from "@/lib/data/sectors";

const ICON_MAP: Record<string, typeof Server> = {
  server: Server,
  factory: Factory,
  wind: Wind,
  hammer: Hammer,
  briefcase: Briefcase,
};

export function SectorSwitcher({
  sectors,
  activeSectorId,
  counts = {},
  total = 0,
}: {
  sectors: Sector[];
  activeSectorId?: string;
  /** sectorId -> how many projects are filed there. */
  counts?: Record<string, number>;
  total?: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSwitch = (sectorId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (sectorId === "all") params.delete("sector");
    else params.set("sector", sectorId);
    // Reset country/status filters on sector switch
    params.delete("country");
    params.delete("status");
    const qs = params.toString();
    router.push(qs ? `?${qs}` : "/hunter");
  };

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {/* Projects arrive from agents without a sector, and filtering by one
          hid every single project on this page. "All" is the honest default:
          you can narrow, but nothing is invisible by accident. */}
      <button
        onClick={() => handleSwitch("all")}
        className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
          !activeSectorId
            ? "border-slate-900 bg-slate-900 text-white"
            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
        }`}
      >
        <Layers className="h-4 w-4" />
        <span>All</span>
        {total > 0 && <Count n={total} active={!activeSectorId} />}
      </button>

      {sectors.map((sector) => {
        const Icon = ICON_MAP[sector.icon] ?? Briefcase;
        const isActive = sector.id === activeSectorId;
        const count = counts[sector.id] ?? 0;
        // A sector we are not hunting in is still a sector we have already
        // found work in. Ten of the eighteen projects on record sit in locked
        // sectors — including the Tata Steel job with a phone number attached
        // to it — and a dead button was hiding all of them. The lock now means
        // "no employee is hunting here", not "you may not look".
        const isLocked = !sector.isActive;
        const unreachable = isLocked && count === 0;

        return (
          <button
            key={sector.id}
            disabled={unreachable}
            title={
              isLocked
                ? count > 0
                  ? `Not being hunted — ${count} project${count === 1 ? "" : "s"} already found here`
                  : "Not being hunted, and nothing found here yet"
                : undefined
            }
            onClick={() => handleSwitch(sector.id)}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
              isActive
                ? "border-sky-500 bg-sky-50 text-sky-900 ring-1 ring-sky-300"
                : unreachable
                  ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300"
                  : isLocked
                    ? "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:bg-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
            }`}
            style={
              isActive
                ? {
                    borderColor: sector.color,
                    backgroundColor: `${sector.color}15`,
                    color: sector.color,
                  }
                : undefined
            }
          >
            <Icon className="h-4 w-4" />
            <span>{sector.name}</span>
            {isLocked && <Lock className="h-3 w-3" />}
            <Count n={count} active={isActive} />
          </button>
        );
      })}
    </div>
  );
}

/** How many projects are behind this tab. Zero is worth saying out loud. */
function Count({ n, active }: { n: number; active: boolean }) {
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
        active ? "bg-white/20" : n === 0 ? "bg-slate-100 text-slate-400" : "bg-slate-100 text-slate-600"
      }`}
    >
      {n}
    </span>
  );
}
