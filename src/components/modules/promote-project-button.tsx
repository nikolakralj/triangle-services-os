"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TrendingUp, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";

// ---------------------------------------------------------------------------
// Turn a discovered project into the thing the company actually sells.
//
// This used to create an `opportunity` — a row in a generic sales pipeline with
// no rules attached, sitting beside the governed commercial model rather than
// inside it. AGENTS.md names the workflow as
//
//   signal -> qualified requirement -> contractor chain -> buyer route
//          -> crew package -> human action -> order -> mobilization -> payment
//
// and "opportunity" appears nowhere in it. The commercial success object is a
// qualified requirement with a real buyer route, and that object is the one the
// database refuses to let anyone fake.
//
// So the button now creates a commercial requirement, carrying the project as
// its source. The requirement starts as a draft and the database will not let
// it reach "qualified" until the evidence exists.
// ---------------------------------------------------------------------------

export function PromoteProjectButton({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState(projectName);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Give the requirement a title.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/commercial/requirements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          // Recorded so the requirement can always name the signal it came from.
          source: `discovered_project:${projectId}`,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Could not create the requirement.");
      }
      setIsOpen(false);
      router.push(`/commercial/${data.requirementId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => {
          setTitle(projectName);
          setError(null);
          setIsOpen(true);
        }}
        className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
      >
        <span className="inline-flex items-center gap-1.5">
          <TrendingUp className="h-4 w-4" />
          Make this a requirement
        </span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <Card className="w-full max-w-md">
            <CardHeader
              title="Make this a requirement"
              description="The commercial object the database enforces. It starts as a draft — scope, route and economics are added as they become real."
              action={
                <button
                  onClick={() => setIsOpen(false)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              }
            />
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-3">
                <label className="block text-sm font-medium text-slate-700">
                  Title
                  <Input
                    className="mt-1"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. 15 electricians, Nauen cable route"
                  />
                </label>

                <p className="rounded-md bg-slate-50 px-2.5 py-2 text-xs leading-relaxed text-slate-600">
                  Filed against <strong>{projectName}</strong>, so the
                  requirement always names the signal it came from.
                </p>

                {error && <p className="text-xs text-rose-600">{error}</p>}

                <div className="flex items-center gap-2">
                  <Button variant="primary" disabled={isLoading}>
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <TrendingUp className="h-4 w-4" />
                    )}
                    Create requirement
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    disabled={isLoading}
                  >
                    Cancel
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
