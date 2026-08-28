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
}: {
  sectors: Sector[];
  activeSectorId?: string;
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
      </button>

      {sectors.map((sector) => {
        const Icon = ICON_MAP[sector.icon] ?? Briefcase;
        const isActive = sector.id === activeSectorId;
        const isLocked = !sector.isActive;

        return (
          <button
            key={sector.id}
            disabled={isLocked}
            onClick={() => handleSwitch(sector.id)}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
              isActive
                ? "border-sky-500 bg-sky-50 text-sky-900 ring-1 ring-sky-300"
                : isLocked
                  ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
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
          </button>
        );
      })}
    </div>
  );
}
