"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  CircleDashed,
  LocateFixed,
  Plus,
  Pencil,
  Trash2,
  X,
  Save,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ContractorChainNodeRow,
  ChainRole,
  ChainKnowledgeLevel,
} from "@/lib/data/contractor-chain";

const ROLE_OPTIONS: { value: ChainRole; label: string }[] = [
  { value: "owner", label: "Owner / operator" },
  { value: "developer", label: "Developer" },
  { value: "epc", label: "EPC contractor" },
  { value: "gc", label: "General contractor" },
  { value: "mep", label: "MEP contractor" },
  { value: "electrical", label: "Electrical contractor" },
  { value: "intermediary", label: "Labor intermediary" },
  { value: "other", label: "Other" },
];

const LEVEL_CONFIG: Record<
  ChainKnowledgeLevel,
  { icon: typeof CheckCircle2; badge: string; shell: string; text: string }
> = {
  known: {
    icon: CheckCircle2,
    badge: "Known",
    shell: "border-emerald-200 bg-emerald-50",
    text: "text-emerald-950",
  },
  inferred: {
    icon: LocateFixed,
    badge: "Inferred",
    shell: "border-amber-200 bg-amber-50",
    text: "text-amber-950",
  },
  unknown: {
    icon: CircleDashed,
    badge: "Unknown",
    shell: "border-slate-200 bg-slate-50",
    text: "text-slate-700",
  },
};

// ─── Single chain node (view + edit) ──────────────────────────────────────

function ChainNodeRow({
  node,
  projectId,
  onRefresh,
}: {
  node: ContractorChainNodeRow;
  projectId: string;
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [companyName, setCompanyName] = useState(node.company_name ?? "");
  const [level, setLevel] = useState<ChainKnowledgeLevel>(node.level);
  const [confidence, setConfidence] = useState<string>(
    node.confidence !== null ? String(node.confidence) : "",
  );
  const [rationale, setRationale] = useState(node.rationale ?? "");
  const [notes, setNotes] = useState(node.notes ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tone = LEVEL_CONFIG[node.level];
  const Icon = tone.icon;

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/hunter/chain-nodes/${node.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: companyName || null,
          level,
          confidence: confidence ? parseInt(confidence) : null,
          rationale: rationale || null,
          notes: notes || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed to save");
      }
      setEditing(false);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Remove ${node.label} from the chain?`)) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/hunter/chain-nodes/${node.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setIsDeleting(false);
    }
  };

  if (editing) {
    return (
      <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-sky-700">
          {node.label}
        </p>
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Company name"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as ChainKnowledgeLevel)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
            >
              <option value="known">Known</option>
              <option value="inferred">Inferred</option>
              <option value="unknown">Unknown</option>
            </select>
            <input
              type="number"
              placeholder="Confidence 0-100"
              value={confidence}
              onChange={(e) => setConfidence(e.target.value)}
              min="0"
              max="100"
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
          </div>
          <input
            type="text"
            placeholder="Rationale (source / reason)"
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
          <textarea
            placeholder="Research notes…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
            >
              {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Save
            </button>
            <button
              onClick={() => setEditing(false)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
            >
              <X className="h-3 w-3" />
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("group rounded-lg border p-3", tone.shell)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Icon className={cn("h-4 w-4", tone.text)} />
            <p className="text-sm font-semibold text-slate-900">{node.label}</p>
            <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              {tone.badge}
            </span>
            {node.confidence !== null && (
              <span className="text-xs text-slate-500">{node.confidence}%</span>
            )}
          </div>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {node.company_name ?? (
              <span className="italic text-slate-400">Not identified</span>
            )}
          </p>
          {node.rationale && (
            <p className="mt-1 text-xs leading-5 text-slate-600">{node.rationale}</p>
          )}
          {node.notes && (
            <p className="mt-1 rounded bg-white/60 px-2 py-1 text-xs italic text-slate-600">
              {node.notes}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={() => setEditing(true)}
            className="rounded p-1 text-slate-400 hover:bg-white/60 hover:text-slate-700"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="rounded p-1 text-slate-400 hover:bg-white/60 hover:text-rose-600"
            title="Remove"
          >
            {isDeleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add new node form ─────────────────────────────────────────────────────

function AddNodeForm({
  projectId,
  onSuccess,
  onCancel,
}: {
  projectId: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [role, setRole] = useState<ChainRole>("gc");
  const [companyName, setCompanyName] = useState("");
  const [level, setLevel] = useState<ChainKnowledgeLevel>("unknown");
  const [confidence, setConfidence] = useState("");
  const [rationale, setRationale] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/hunter/projects/${projectId}/chain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          company_name: companyName || null,
          level,
          confidence: confidence ? parseInt(confidence) : null,
          rationale: rationale || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add node");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3"
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Add chain node
      </p>
      <div className="space-y-2">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as ChainRole)}
          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Company name"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as ChainKnowledgeLevel)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
          >
            <option value="known">Known</option>
            <option value="inferred">Inferred</option>
            <option value="unknown">Unknown</option>
          </select>
          <input
            type="number"
            placeholder="Confidence %"
            value={confidence}
            onChange={(e) => setConfidence(e.target.value)}
            min="0"
            max="100"
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
        </div>
        <input
          type="text"
          placeholder="Rationale / source"
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
        />
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            Add node
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}

// ─── Main panel ────────────────────────────────────────────────────────────

export function ContractorChainPanel({
  projectId,
  savedNodes,
  inferredNodes,
}: {
  projectId: string;
  savedNodes: ContractorChainNodeRow[];
  inferredNodes: { id: string; label: string; company?: string; level: ChainKnowledgeLevel; confidence?: number; rationale: string }[];
}) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);

  const handleRefresh = () => {
    router.refresh();
  };

  // Roles already covered by saved nodes
  const savedRoles = new Set(savedNodes.map((n) => n.role));

  // Inferred fallbacks for roles not yet saved
  const pendingInferred = inferredNodes.filter(
    (n) => !savedRoles.has(n.id as ChainRole) && n.level !== "unknown",
  );

  return (
    <div className="space-y-3">
      {/* Saved / confirmed nodes */}
      {savedNodes.length > 0 && (
        <div className="space-y-2">
          {savedNodes.map((node) => (
            <ChainNodeRow
              key={node.id}
              node={node}
              projectId={projectId}
              onRefresh={handleRefresh}
            />
          ))}
        </div>
      )}

      {/* AI-inferred suggestions not yet saved */}
      {pendingInferred.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            AI suggestions (not yet saved)
          </p>
          {pendingInferred.map((node) => {
            const tone = LEVEL_CONFIG[node.level];
            const Icon = tone.icon;
            return (
              <div
                key={node.id}
                className={cn("rounded-lg border p-3 opacity-70", tone.shell)}
              >
                <div className="flex items-start gap-2">
                  <Icon className={cn("mt-0.5 h-4 w-4", tone.text)} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">{node.label}</p>
                      <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                        {tone.badge} · AI
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-800">{node.company ?? "—"}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{node.rationale}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {savedNodes.length === 0 && pendingInferred.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-sm text-slate-400">
          No chain data yet. Add nodes manually or run a hunt to get AI suggestions.
        </p>
      )}

      {/* Add form */}
      {showAdd ? (
        <AddNodeForm
          projectId={projectId}
          onSuccess={() => {
            setShowAdd(false);
            handleRefresh();
          }}
          onCancel={() => setShowAdd(false)}
        />
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"
        >
          <Plus className="h-3.5 w-3.5" />
          Add chain node
        </button>
      )}
    </div>
  );
}
