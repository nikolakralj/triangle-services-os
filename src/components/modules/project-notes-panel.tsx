"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProjectNotesPanelProps {
  projectId: string;
  initialBody: string;
  initialUpdatedAt: string | null;
}

export function ProjectNotesPanel({
  projectId,
  initialBody,
  initialUpdatedAt,
}: ProjectNotesPanelProps) {
  const [body, setBody] = useState(initialBody);
  const [savedBody, setSavedBody] = useState(initialBody);
  const [updatedAt, setUpdatedAt] = useState<string | null>(initialUpdatedAt);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const dirty = body !== savedBody;

  async function save() {
    setSaving(true);
    setError(null);
    setJustSaved(false);
    try {
      const res = await fetch(`/api/projects/${projectId}/notes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Failed to save. Please try again.");
        return;
      }
      const data = (await res.json()) as {
        note: { body: string; updatedAt: string | null };
      };
      setSavedBody(data.note.body);
      setBody(data.note.body);
      setUpdatedAt(data.note.updatedAt);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        Freeform memory for this project — required documents, buyer quirks,
        client preferences. The Project Agent reads this on every run.
      </p>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={6}
        placeholder="e.g. Client requires A1 certificates + valid ID for all EU-posted workers. Buyer prefers email over LinkedIn. Site induction needed before mobilisation."
        className="w-full resize-y rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-400">
          {updatedAt
            ? `Last saved ${new Date(updatedAt).toLocaleString()}`
            : "Not saved yet"}
        </p>
        <div className="flex items-center gap-2">
          {error && (
            <span className="flex items-center gap-1 text-xs text-rose-600">
              <AlertCircle className="h-3 w-3 shrink-0" />
              {error}
            </span>
          )}
          {justSaved && !dirty && (
            <span className="flex items-center gap-1 text-xs text-emerald-600">
              <CheckCircle2 className="h-3 w-3 shrink-0" />
              Saved
            </span>
          )}
          <Button
            variant="primary"
            className="h-8 px-3 text-xs"
            disabled={saving || !dirty}
            onClick={() => void save()}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save note
          </Button>
        </div>
      </div>
    </div>
  );
}
