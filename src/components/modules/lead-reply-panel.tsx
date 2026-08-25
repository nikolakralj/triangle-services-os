"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Loader2,
  PenLine,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReplyDraft {
  id: string;
  subject: string;
  body: string;
  asks: string[];
  status: "draft" | "sent" | "archived";
  sentAt: string | null;
}

const ASK_LABEL: Record<string, string> = {
  headcount: "Headcount",
  rate: "Rate",
  location: "Location",
  start_date: "Start date",
  duration: "Duration",
};

export function LeadReplyPanel({
  leadId,
  contactName,
  existingDraft,
}: {
  leadId: string;
  contactName: string | null;
  existingDraft: ReplyDraft | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<ReplyDraft | null>(existingDraft);
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(existingDraft?.subject ?? "");
  const [body, setBody] = useState(existingDraft?.body ?? "");

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/job-intake/leads/${leadId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as {
        draft?: ReplyDraft;
        error?: string;
      };
      if (!res.ok || !data.draft) {
        setError(data.error ?? "Could not draft a reply.");
        return;
      }
      setDraft(data.draft);
      setSubject(data.draft.subject);
      setBody(data.draft.body);
      setOpen(true);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function patch(payload: Record<string, unknown>) {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/job-intake/leads/${leadId}/reply`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: draft.id, ...payload }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        draft?: ReplyDraft;
        error?: string;
      };
      if (!res.ok || !data.draft) {
        setError(data.error ?? "Could not save.");
        return;
      }
      setDraft(data.draft);
      setEditing(false);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${subject}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy — select the text and copy manually.");
    }
  }

  if (!draft) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          className="h-7 px-2.5 text-xs"
          disabled={generating}
          onClick={() => void generate()}
        >
          {generating ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <PenLine className="h-3 w-3" />
          )}
          {generating ? "Writing…" : "Draft reply"}
        </Button>
        {error && (
          <span className="inline-flex items-center gap-1 text-xs text-rose-600">
            <AlertCircle className="h-3 w-3 shrink-0" />
            {error}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="w-full space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          className="h-7 px-2.5 text-xs"
          onClick={() => setOpen((o) => !o)}
        >
          <PenLine className="h-3 w-3" />
          {open ? "Hide draft" : "Show draft"}
        </Button>
        {draft.status === "sent" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            <CheckCircle2 className="h-3 w-3" />
            Sent{draft.sentAt ? ` ${new Date(draft.sentAt).toLocaleDateString()}` : ""}
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
            Draft — not sent
          </span>
        )}
        {draft.asks.length > 0 && (
          <span className="text-[11px] text-slate-500">
            asks for {draft.asks.map((a) => ASK_LABEL[a] ?? a).join(", ")}
          </span>
        )}
      </div>

      {open && (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
          {editing ? (
            <>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={12}
                className="w-full resize-y rounded-md border border-slate-200 px-2.5 py-2 text-sm leading-relaxed text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-slate-900">{subject}</p>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">
                {body}
              </pre>
            </>
          )}

          {error && (
            <p className="flex items-start gap-1.5 text-xs text-rose-600">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
            {editing ? (
              <>
                <Button
                  variant="primary"
                  className="h-7 px-2.5 text-xs"
                  disabled={saving}
                  onClick={() => void patch({ subject, body })}
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Save changes
                </Button>
                <Button
                  variant="ghost"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => {
                    setEditing(false);
                    setSubject(draft.subject);
                    setBody(draft.body);
                  }}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="secondary"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => void copy()}
                >
                  {copied ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </Button>
                <Button
                  variant="ghost"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setEditing(true)}
                >
                  <PenLine className="h-3 w-3" />
                  Edit
                </Button>
                {draft.status !== "sent" && (
                  <Button
                    variant="ghost"
                    className="h-7 px-2.5 text-xs"
                    disabled={saving}
                    onClick={() => void patch({ status: "sent" })}
                  >
                    {saving ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Send className="h-3 w-3" />
                    )}
                    I sent this
                  </Button>
                )}
                <Button
                  variant="ghost"
                  className="h-7 px-2.5 text-xs"
                  disabled={generating}
                  onClick={() => void generate()}
                >
                  {generating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : null}
                  Rewrite
                </Button>
              </>
            )}
          </div>

          <p className="text-[11px] text-slate-500">
            Copy this into your own email to {contactName ?? "the recruiter"} and
            send it yourself. Triangle OS never sends mail — &ldquo;I sent
            this&rdquo; only records that you did.
          </p>
        </div>
      )}
    </div>
  );
}
