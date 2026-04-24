"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DndContext, DragEndEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import type { Company, Opportunity, PipelineStage } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

function PipelineCard({
  opportunity,
  company,
}: {
  opportunity: Opportunity;
  company?: Company;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: opportunity.id,
  });
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className="rounded-md border border-slate-200 bg-white p-3 shadow-sm"
    >
      <div className="flex items-start gap-2">
        <button
          className="mt-0.5 cursor-grab rounded p-1 text-slate-400 hover:bg-slate-100"
          {...listeners}
          {...attributes}
          aria-label="Drag opportunity"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <Link
            href={`/opportunities/${opportunity.id}`}
            className="font-semibold text-slate-950 hover:text-sky-700"
          >
            {opportunity.title}
          </Link>
          <p className="mt-1 text-xs text-slate-500">{company?.name ?? "No company"} · {opportunity.country}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
            <span>Crew: {opportunity.estimatedCrewSize ?? "n/a"}</span>
            <span>{formatCurrency(opportunity.estimatedValue)}</span>
            <span>Start: {opportunity.expectedStartDate ?? "n/a"}</span>
            <span>Owner: {opportunity.owner}</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">Next: {opportunity.nextStep ?? "Set next step"}</p>
        </div>
      </div>
    </article>
  );
}

function PipelineColumn({
  stage,
  opportunities,
  companies,
}: {
  stage: PipelineStage;
  opportunities: Opportunity[];
  companies: Company[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <section
      ref={setNodeRef}
      className={`flex h-full min-h-[520px] w-80 shrink-0 flex-col rounded-lg border ${
        isOver ? "border-sky-400 bg-sky-50" : "border-slate-200 bg-slate-100"
      }`}
    >
      <div className="border-b border-slate-200 p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-950">{stage.name}</h2>
          <Badge>{opportunities.length}</Badge>
        </div>
        <p className="mt-1 min-h-8 text-xs text-slate-500">{stage.description}</p>
      </div>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
        {opportunities.map((opportunity) => (
          <PipelineCard
            key={opportunity.id}
            opportunity={opportunity}
            company={companies.find((company) => company.id === opportunity.companyId)}
          />
        ))}
      </div>
    </section>
  );
}

export function PipelineBoard({
  initialOpportunities,
  stages,
  companies,
}: {
  initialOpportunities: Opportunity[];
  stages: PipelineStage[];
  companies: Company[];
}) {
  const [opportunities, setOpportunities] = useState(initialOpportunities);
  const [owner, setOwner] = useState("all");
  const [country, setCountry] = useState("all");

  const filtered = useMemo(
    () =>
      opportunities.filter(
        (opportunity) =>
          (owner === "all" || opportunity.owner === owner) &&
          (country === "all" || opportunity.country === country),
      ),
    [country, opportunities, owner],
  );

  function onDragEnd(event: DragEndEvent) {
    const opportunityId = String(event.active.id);
    const stageId = event.over?.id ? String(event.over.id) : undefined;
    if (!stageId) return;

    setOpportunities((current) =>
      current.map((opportunity) =>
        opportunity.id === opportunityId ? { ...opportunity, stageId } : opportunity,
      ),
    );

    fetch(`/api/opportunities/${opportunityId}/stage`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId }),
    }).catch(() => {
      // The UI remains useful in demo mode even without Supabase.
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
        <Select className="max-w-48" value={owner} onChange={(event) => setOwner(event.target.value)}>
          <option value="all">All owners</option>
          <option value="Nikola">Nikola</option>
          <option value="Ralph">Ralph</option>
        </Select>
        <Select className="max-w-48" value={country} onChange={(event) => setCountry(event.target.value)}>
          <option value="all">All countries</option>
          {[...new Set(opportunities.map((opportunity) => opportunity.country))].map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </Select>
        <Button>Add opportunity</Button>
      </div>
      <DndContext onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => (
            <PipelineColumn
              key={stage.id}
              stage={stage}
              companies={companies}
              opportunities={filtered.filter((opportunity) => opportunity.stageId === stage.id)}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
