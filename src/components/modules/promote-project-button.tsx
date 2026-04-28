"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TrendingUp, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import type { Company, PipelineStage } from "@/lib/types";

export function PromoteProjectButton({
  projectName,
  country,
  estimatedValueEur,
  companies,
  stages,
}: {
  projectName: string;
  country?: string;
  estimatedValueEur?: number;
  companies: Company[];
  stages: PipelineStage[];
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState(projectName);
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [stageId, setStageId] = useState(stages[0]?.id ?? "");
  const [countryVal, setCountryVal] = useState(country ?? "");
  const [estimatedValue, setEstimatedValue] = useState(
    estimatedValueEur ? String(estimatedValueEur) : "",
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpen = () => {
    setTitle(projectName);
    setCountryVal(country ?? "");
    setEstimatedValue(estimatedValueEur ? String(estimatedValueEur) : "");
    setError(null);
    setIsOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !companyId) {
      setError("Title and company are required.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          companyId,
          stageId: stageId || stages[0]?.id,
          country: countryVal || "Unknown",
          estimatedValue: estimatedValue ? parseInt(estimatedValue) : null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to create opportunity");
      setIsOpen(false);
      router.push(`/pipeline`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
      >
        Promote to Opportunity
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader
              title="Promote to Opportunity"
              description={`Based on: ${projectName}`}
            />
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Title *
                  </label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Company *
                  </label>
                  <Select
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
                    required
                  >
                    <option value="">— select a company —</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                  {companies.length === 0 && (
                    <p className="mt-1 text-xs text-amber-600">
                      No companies yet.{" "}
                      <a href="/companies" className="underline">
                        Add one first.
                      </a>
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Pipeline stage
                  </label>
                  <Select
                    value={stageId}
                    onChange={(e) => setStageId(e.target.value)}
                  >
                    {stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Country
                    </label>
                    <Input
                      value={countryVal}
                      onChange={(e) => setCountryVal(e.target.value)}
                      placeholder="e.g. Germany"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Est. value (€)
                    </label>
                    <Input
                      type="number"
                      value={estimatedValue}
                      onChange={(e) => setEstimatedValue(e.target.value)}
                      placeholder="e.g. 500000"
                    />
                  </div>
                </div>
                {error && (
                  <p className="text-sm text-rose-600">{error}</p>
                )}
                <div className="flex gap-2 pt-2">
                  <Button type="submit" disabled={isLoading} className="flex-1">
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating…
                      </>
                    ) : (
                      <>
                        <TrendingUp className="mr-2 h-4 w-4" />
                        Create opportunity
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setIsOpen(false)}
                    disabled={isLoading}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
