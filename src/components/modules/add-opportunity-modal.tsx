"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import type { Company, PipelineStage } from "@/lib/types";

export function AddOpportunityModal({
  isOpen,
  onClose,
  onSuccess,
  companies,
  stages,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  companies: Company[];
  stages: PipelineStage[];
}) {
  const [title, setTitle] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [stageId, setStageId] = useState("");
  const [country, setCountry] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !companyId) {
      alert("Title and company are required");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          companyId,
          stageId: stageId || stages[0]?.id,
          country: country || "Unknown",
          estimatedValue: estimatedValue ? parseInt(estimatedValue) : null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create opportunity");
      }

      setTitle("");
      setCompanyId("");
      setStageId("");
      setCountry("");
      setEstimatedValue("");
      onSuccess();
      onClose();
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-md">
        <CardHeader title="Add Opportunity" />
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Title *
              </label>
              <Input
                placeholder="Opportunity title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Company *
              </label>
              <Select
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                disabled={isLoading}
              >
                <option value="">Select company</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Stage
              </label>
              <Select
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
                disabled={isLoading}
              >
                <option value="">Auto (Research)</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Country
              </label>
              <Input
                placeholder="e.g., Germany"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Estimated Value (EUR)
              </label>
              <Input
                placeholder="50000"
                type="number"
                value={estimatedValue}
                onChange={(e) => setEstimatedValue(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                type="submit"
                disabled={isLoading}
                className="flex-1"
              >
                {isLoading ? "Creating..." : "Create"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={isLoading}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
