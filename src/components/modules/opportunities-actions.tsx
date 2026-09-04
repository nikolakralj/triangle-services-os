"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddOpportunityModal } from "./add-opportunity-modal";
import type { Company, Opportunity, PipelineStage } from "@/lib/types";

// ---------------------------------------------------------------------------
// The two things this page can actually do.
//
// Both buttons here used to render enabled and do nothing when pressed, beside
// four <Select> filters that each had a single hardcoded option. A control that
// looks live and is inert is the same lie as a metric that reports work nobody
// did — it just fails at the moment someone trusts it.
//
// "Add opportunity" reuses the modal the pipeline board already posts with, so
// there is one way to create an opportunity rather than two that can drift.
// ---------------------------------------------------------------------------

export function OpportunitiesActions({
  companies,
  stages,
  opportunities,
}: {
  companies: Company[];
  stages: PipelineStage[];
  opportunities: Opportunity[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function exportCsv() {
    const header = [
      "Title",
      "Company",
      "Stage",
      "Country",
      "Estimated value",
      "Owner",
    ];
    const companyName = new Map(companies.map((c) => [c.id, c.name]));
    const stageName = new Map(stages.map((s) => [s.id, s.name]));

    const rows = opportunities.map((o) => [
      o.title ?? "",
      companyName.get(o.companyId ?? "") ?? "",
      stageName.get(o.stageId ?? "") ?? "",
      o.country ?? "",
      o.estimatedValue != null ? String(o.estimatedValue) : "",
      o.ownerName ?? "",
    ]);

    // Quote every field and double any embedded quote: a company called
    // 'Meyer, Otto & Co. "Nord"' must not silently become three columns.
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");

    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `opportunities-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="secondary"
        className="h-8 px-3 text-xs"
        disabled={opportunities.length === 0}
        onClick={exportCsv}
      >
        <Download className="h-3.5 w-3.5" />
        Export CSV
      </Button>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Add opportunity
      </Button>

      <AddOpportunityModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onSuccess={() => {
          setOpen(false);
          router.refresh();
        }}
        companies={companies}
        stages={stages}
      />
    </div>
  );
}
