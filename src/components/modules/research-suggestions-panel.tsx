"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  Package,
  User,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ResearchSuggestionRow, ResearchSuggestionStatus } from "@/lib/data/research";
import {
  buildSuggestionGroupKey,
  buildSuggestionTitle,
  getSuggestionStrength,
} from "@/lib/research/suggestions";

type QueueFilter = "all" | "chain_node" | "buyer_contact" | "package_opportunity" | "note";

type SuggestionGroup = {
  key: string;
  status: ResearchSuggestionStatus;
  type: ResearchSuggestionRow["suggestion_type"];
  title: string;
  canonical: ResearchSuggestionRow;
  variants: ResearchSuggestionRow[];
  bestConfidence: number | null;
};

const TYPE_META: Record<
  ResearchSuggestionRow["suggestion_type"],
  { label: string; icon: typeof Building2; color: string }
> = {
  chain_node: { label: "Contractor", icon: Building2, color: "bg-sky-100 text-sky-800" },
  buyer_contact: { label: "Contact", icon: User, color: "bg-violet-100 text-violet-800" },
  package_opportunity: { label: "Package", icon: Package, color: "bg-amber-100 text-amber-800" },
  note: { label: "Note", icon: FileText, color: "bg-slate-100 text-slate-700" },
};

function confidenceValue(score: number | null) {
  return score ?? -1;
}

function ConfidenceBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  const color =
    score >= 75
      ? "bg-emerald-100 text-emerald-800"
      : score >= 50
        ? "bg-amber-100 text-amber-800"
        : "bg-rose-100 text-rose-800";
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", color)}>{score}%</span>;
}

function groupSuggestions(suggestions: ResearchSuggestionRow[]): SuggestionGroup[] {
  const groups = new Map<string, SuggestionGroup>();
  for (const suggestion of suggestions) {
    const key = buildSuggestionGroupKey(suggestion);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        key,
        status: suggestion.status,
        type: suggestion.suggestion_type,
        title: buildSuggestionTitle(suggestion),
        canonical: suggestion,
        variants: [],
        bestConfidence: suggestion.confidence,
      });
      continue;
    }

    const currentBest = confidenceValue(existing.canonical.confidence);
    const candidate = confidenceValue(suggestion.confidence);
    if (candidate > currentBest) {
      existing.variants.push(existing.canonical);
      existing.canonical = suggestion;
    } else {
      existing.variants.push(suggestion);
    }

    if (confidenceValue(suggestion.confidence) > confidenceValue(existing.bestConfidence)) {
      existing.bestConfidence = suggestion.confidence;
    }
  }

  return [...groups.values()].sort(
    (a, b) =>
      confidenceValue(b.bestConfidence) - confidenceValue(a.bestConfidence) ||
      Date.parse(b.canonical.created_at) - Date.parse(a.canonical.created_at),
  );
}

async function patchSuggestion(
  suggestionId: string,
  action: "accept" | "reject",
  reason?: string,
) {
  const body: Record<string, unknown> = { action };
  if (action === "reject") {
    body.reason = reason ?? "Rejected in grouped review.";
  }
  const res = await fetch(`/api/research/suggestions/${suggestionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
}

function GroupCard({
  group,
  showWeak,
  onReviewed,
}: {
  group: SuggestionGroup;
  showWeak: boolean;
  onReviewed: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showVariants, setShowVariants] = useState(false);
  const [applyToVariants, setApplyToVariants] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = TYPE_META[group.type] ?? TYPE_META.note;
  const Icon = meta.icon;

  const visibleVariants = showWeak
    ? group.variants
    : group.variants.filter((variant) => getSuggestionStrength(variant.confidence) !== "weak");

  async function handleGroupAction(action: "accept" | "reject") {
    setLoading(true);
    setError(null);
    try {
      await patchSuggestion(group.canonical.id, action);
      if (applyToVariants) {
        for (const variant of visibleVariants) {
          if (variant.status !== "pending") continue;
          await patchSuggestion(variant.id, action);
        }
      }
      onReviewed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start gap-3 px-4 py-3">
        <div className={cn("mt-0.5 rounded-lg p-1.5", meta.color)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", meta.color)}>{meta.label}</span>
            <ConfidenceBadge score={group.canonical.confidence} />
            {group.variants.length > 0 ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                {group.variants.length} variant{group.variants.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-900">{group.title}</p>
          <p className="mt-1 line-clamp-2 text-xs text-slate-500">{group.canonical.evidence_text}</p>
        </div>
        <button onClick={() => setExpanded((v) => !v)} className="rounded p-1 text-slate-400 hover:text-slate-700">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-slate-100 px-4 pb-4 pt-3">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <p className="mb-1 font-semibold text-slate-700">Canonical evidence</p>
            <p>{group.canonical.evidence_text}</p>
            <a
              href={group.canonical.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-sky-600 hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              View source
            </a>
          </div>

          {group.variants.length > 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <button
                onClick={() => setShowVariants((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700"
              >
                {showVariants ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {showVariants ? "Hide variants" : "Show variants"}
              </button>
              {showVariants && (
                <div className="mt-2 space-y-2">
                  {visibleVariants.length === 0 ? (
                    <p className="text-xs text-slate-500">Only weak variants exist; enable &quot;Show weak&quot; to review.</p>
                  ) : (
                    visibleVariants.map((variant) => (
                      <div key={variant.id} className="rounded border border-slate-200 bg-white px-2.5 py-2 text-xs">
                        <div className="mb-1 flex items-center gap-2">
                          <ConfidenceBadge score={variant.confidence} />
                          <span className="text-slate-400">{new Date(variant.created_at).toLocaleString()}</span>
                        </div>
                        <p className="text-slate-700">{variant.evidence_text}</p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : null}

          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-slate-300"
              checked={applyToVariants}
              onChange={(e) => setApplyToVariants(e.target.checked)}
            />
            Apply action to visible variants
          </label>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          {group.status === "pending" ? (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleGroupAction("accept")}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Accept group
              </button>
              <button
                onClick={() => handleGroupAction("reject")}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-100 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
              >
                <XCircle className="h-3.5 w-3.5" />
                Reject group
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Group already reviewed.</p>
          )}
        </div>
      )}
    </div>
  );
}

export function ResearchSuggestionsPanel({
  suggestions,
  showWeakDefault = false,
}: {
  suggestions: ResearchSuggestionRow[];
  showWeakDefault?: boolean;
}) {
  const router = useRouter();
  const [activeStatus, setActiveStatus] = useState<ResearchSuggestionStatus | "all">("pending");
  const [typeFilter, setTypeFilter] = useState<QueueFilter>("all");
  const [showWeak, setShowWeak] = useState(showWeakDefault);
  const [bulkLoading, setBulkLoading] = useState(false);

  const groups = useMemo(() => {
    const byStatus = activeStatus === "all" ? suggestions : suggestions.filter((s) => s.status === activeStatus);
    const byType = typeFilter === "all" ? byStatus : byStatus.filter((s) => s.suggestion_type === typeFilter);
    const weakFiltered = showWeak ? byType : byType.filter((s) => getSuggestionStrength(s.confidence) !== "weak");
    return groupSuggestions(weakFiltered);
  }, [activeStatus, showWeak, suggestions, typeFilter]);

  const pendingHighConfidence = useMemo(
    () =>
      groups.filter(
        (g) => g.status === "pending" && (g.canonical.confidence ?? 0) >= 80,
      ),
    [groups],
  );

  const visibleGroups = groups.slice(0, 60);
  const hiddenCount = Math.max(groups.length - visibleGroups.length, 0);

  async function handleAcceptHighConfidence() {
    if (pendingHighConfidence.length === 0) return;
    setBulkLoading(true);
    try {
      for (const group of pendingHighConfidence) {
        await patchSuggestion(group.canonical.id, "accept");
      }
      router.refresh();
    } finally {
      setBulkLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
        <button
          onClick={handleAcceptHighConfidence}
          disabled={bulkLoading || pendingHighConfidence.length === 0}
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {bulkLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          Accept all high-confidence ({pendingHighConfidence.length})
        </button>
        <select
          value={activeStatus}
          onChange={(e) => setActiveStatus(e.target.value as ResearchSuggestionStatus | "all")}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs"
        >
          <option value="pending">Pending</option>
          <option value="accepted">Accepted</option>
          <option value="edited_and_accepted">Accepted (edited)</option>
          <option value="rejected">Rejected</option>
          <option value="all">All</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as QueueFilter)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs"
        >
          <option value="all">All types</option>
          <option value="chain_node">Contractors</option>
          <option value="buyer_contact">Contacts</option>
          <option value="package_opportunity">Packages</option>
          <option value="note">Notes</option>
        </select>
        <label className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700">
          <input type="checkbox" checked={showWeak} onChange={(e) => setShowWeak(e.target.checked)} />
          Show weak
        </label>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
          No suggestions in this filter.
        </div>
      ) : (
        <div className="space-y-3">
          {visibleGroups.map((group) => (
            <GroupCard key={group.key} group={group} showWeak={showWeak} onReviewed={() => router.refresh()} />
          ))}
          {hiddenCount > 0 ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              Showing first 60 groups. Refine filters to review the remaining {hiddenCount}.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
