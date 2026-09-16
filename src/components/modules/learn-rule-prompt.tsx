"use client";

import { useState } from "react";
import { Sparkles, Check, AlertCircle, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LearnRulePromptProps {
  /** The target employee role or ID to learn into */
  targetRole?: string;
  targetEmployeeId?: string;
  targetEmployeeName?: string;
  /** Summary of what changed (e.g. "Changed greeting, removed marketing pitch") */
  diffSummary?: string;
  /** Suggested rule placeholder */
  suggestedRulePlaceholder?: string;
  onRuleSaved?: (rule: string) => void;
  onDismiss?: () => void;
}

export function LearnRulePrompt({
  targetRole = "inbox_coordinator",
  targetEmployeeId,
  targetEmployeeName = "Bob",
  diffSummary,
  suggestedRulePlaceholder = "e.g. Always ask for headcount and start date before sharing rates.",
  onRuleSaved,
  onDismiss,
}: LearnRulePromptProps) {
  const [ruleText, setRuleText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!ruleText.trim()) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/agents/house-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee: targetEmployeeId,
          role: targetRole,
          rule: ruleText.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not save the house rule.");
        return;
      }

      setSaved(true);
      if (onRuleSaved) onRuleSaved(ruleText.trim());
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900">
        <div className="flex items-center gap-2">
          <Check className="h-4 w-4 text-emerald-600" />
          <span className="font-semibold">Rule saved for {targetEmployeeName}!</span>
        </div>
        <p className="mt-1 text-emerald-700">
          Saved as standing house rules. {targetEmployeeName} will follow this instruction on future drafts.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 font-semibold text-indigo-950">
          <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
          <span>Teach {targetEmployeeName} from your edit</span>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-[11px] text-slate-400 hover:text-slate-600"
          >
            Dismiss
          </button>
        )}
      </div>

      <p className="mt-1 text-slate-600 leading-relaxed">
        You reworded the AI draft{diffSummary ? ` (${diffSummary})` : ""}. Save a standing instruction in your own words so {targetEmployeeName} writes like this next time.
      </p>

      <div className="mt-2.5 space-y-2">
        <input
          type="text"
          value={ruleText}
          onChange={(e) => setRuleText(e.target.value)}
          placeholder={suggestedRulePlaceholder}
          className="w-full rounded-md border border-indigo-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          onKeyDown={(e) => {
            if (e.key === "Enter" && ruleText.trim() && !saving) {
              e.preventDefault();
              void handleSave();
            }
          }}
        />

        {error && (
          <p className="flex items-center gap-1 text-[11px] text-rose-600">
            <AlertCircle className="h-3 w-3" />
            {error}
          </p>
        )}

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            className="h-6 bg-indigo-600 px-2.5 text-[11px] hover:bg-indigo-700"
            disabled={saving || !ruleText.trim()}
            onClick={() => void handleSave()}
          >
            {saving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ArrowRight className="h-3 w-3" />
            )}
            Save as house rule
          </Button>

          {onDismiss && (
            <Button
              variant="ghost"
              className="h-6 px-2 text-[11px] text-slate-500 hover:text-slate-700"
              onClick={onDismiss}
            >
              Skip
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
