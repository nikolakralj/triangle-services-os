"use client";

/**
 * OutreachDraftsPanel — review, edit, copy, and track AI-drafted outreach.
 *
 * Drafts are NEVER auto-sent. The user copies to clipboard, sends manually
 * via LinkedIn / their email client, then marks the draft as sent here.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Link2,
  Mail,
  MessageSquare,
  Copy,
  Check,
  Send,
  Archive,
  Pencil,
  Save,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { OutreachDraftRow, OutreachChannel } from "@/lib/data/outreach";

interface BuyerLabel {
  contactId?: string | null;
  suggestionId?: string | null;
  name: string;
  company: string;
  title?: string | null;
}

interface PackageLabel {
  id: string;
  title: string;
}

const CHANNEL_META: Record<
  OutreachChannel,
  { label: string; icon: typeof Link2; color: string }
> = {
  linkedin_connect: {
    label: "LinkedIn connect",
    icon: Link2,
    color: "bg-sky-100 text-sky-800",
  },
  linkedin_message: {
    label: "LinkedIn DM",
    icon: MessageSquare,
    color: "bg-indigo-100 text-indigo-800",
  },
  email_cold: {
    label: "Email cold",
    icon: Mail,
    color: "bg-amber-100 text-amber-800",
  },
  email_followup: {
    label: "Email follow-up",
    icon: Mail,
    color: "bg-orange-100 text-orange-800",
  },
};

const STATUS_META: Record<
  string,
  { label: string; color: string }
> = {
  draft: { label: "Draft", color: "bg-slate-100 text-slate-700" },
  sent: { label: "Sent", color: "bg-emerald-100 text-emerald-800" },
  replied: { label: "Replied", color: "bg-violet-100 text-violet-800" },
  no_reply: { label: "No reply", color: "bg-rose-100 text-rose-700" },
  archived: { label: "Archived", color: "bg-slate-100 text-slate-500" },
};

// ── One draft card ──────────────────────────────────────────────────────────

function DraftCard({
  draft,
  buyer,
  pkg,
  onChanged,
}: {
  draft: OutreachDraftRow;
  buyer: BuyerLabel | null;
  pkg: PackageLabel | null;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editedSubject, setEditedSubject] = useState(draft.subject ?? "");
  const [editedBody, setEditedBody] = useState(draft.body);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = CHANNEL_META[draft.channel];
  const Icon = meta.icon;
  const statusMeta = STATUS_META[draft.status] ?? STATUS_META.draft;

  const isEmail = draft.channel.startsWith("email_");

  async function copyToClipboard() {
    const text = isEmail
      ? `Subject: ${draft.subject ?? ""}\n\n${draft.body}`
      : draft.body;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy to clipboard");
    }
  }

  async function patchDraft(action: string, payload?: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/research/outreach/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(payload ?? {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
            meta.color,
          )}
        >
          <Icon className="h-3 w-3" />
          {meta.label}
        </span>
        {draft.variant_label && (
          <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
            {draft.variant_label}
          </span>
        )}
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold",
            statusMeta.color,
          )}
        >
          {statusMeta.label}
        </span>
        <div className="ml-auto text-[11px] text-slate-500">
          {buyer
            ? `→ ${buyer.name} @ ${buyer.company}` +
              (buyer.title ? ` (${buyer.title})` : "")
            : ""}
          {pkg ? ` · ${pkg.title}` : ""}
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        {isEmail && (
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Subject
            </p>
            {editing ? (
              <input
                type="text"
                value={editedSubject}
                onChange={(e) => setEditedSubject(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sky-100"
              />
            ) : (
              <p className="text-sm font-semibold text-slate-800">
                {draft.subject || "(no subject)"}
              </p>
            )}
          </div>
        )}

        <div>
          {!isEmail && (
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Message
            </p>
          )}
          {editing ? (
            <textarea
              value={editedBody}
              onChange={(e) => setEditedBody(e.target.value)}
              rows={Math.min(20, Math.max(6, editedBody.split("\n").length + 2))}
              className="w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-sky-100"
            />
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {draft.body}
            </p>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-1.5 rounded-md bg-rose-50 px-2 py-1 text-xs text-rose-700">
            <AlertCircle className="h-3 w-3" />
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {editing ? (
            <>
              <button
                onClick={() =>
                  patchDraft("edit", {
                    subject: isEmail ? editedSubject : null,
                    body: editedBody,
                  }).then(() => setEditing(false))
                }
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Save
              </button>
              <button
                onClick={() => {
                  setEditedSubject(draft.subject ?? "");
                  setEditedBody(draft.body);
                  setEditing(false);
                }}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
              >
                <X className="h-3 w-3" />
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={copyToClipboard}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold",
                  copied
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-sky-600 text-white hover:bg-sky-700",
                )}
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    Copy
                  </>
                )}
              </button>

              <button
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
              >
                <Pencil className="h-3 w-3" />
                Edit
              </button>

              {draft.status === "draft" && (
                <button
                  onClick={() => patchDraft("mark_sent")}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  Mark sent
                </button>
              )}

              {draft.status === "sent" && (
                <button
                  onClick={() => patchDraft("mark_replied")}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-60"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  They replied
                </button>
              )}

              {draft.status !== "archived" && (
                <button
                  onClick={() => patchDraft("archive")}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-60"
                >
                  <Archive className="h-3 w-3" />
                  Archive
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────

export function OutreachDraftsPanel({
  drafts,
  buyersById,
  packagesById,
}: {
  drafts: OutreachDraftRow[];
  /** Map of buyer_contact_id OR buyer_suggestion_id → label */
  buyersById: Record<string, BuyerLabel>;
  packagesById: Record<string, PackageLabel>;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<
    "draft" | "sent" | "replied" | "archived"
  >("draft");

  const counts = drafts.reduce(
    (acc, d) => {
      acc[d.status] = (acc[d.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const visible = drafts.filter((d) => d.status === activeTab);

  // Group by variant_group_id so variants from one generation appear together
  const groups = new Map<string, OutreachDraftRow[]>();
  for (const d of visible) {
    const key = d.variant_group_id ?? d.id;
    const existing = groups.get(key) ?? [];
    existing.push(d);
    groups.set(key, existing);
  }
  const groupedList = Array.from(groups.values()).sort((a, b) => {
    const aTime = new Date(a[0].created_at).getTime();
    const bTime = new Date(b[0].created_at).getTime();
    return bTime - aTime;
  });

  function lookupBuyer(d: OutreachDraftRow): BuyerLabel | null {
    if (d.buyer_contact_id && buyersById[d.buyer_contact_id])
      return buyersById[d.buyer_contact_id];
    if (d.buyer_suggestion_id && buyersById[d.buyer_suggestion_id])
      return buyersById[d.buyer_suggestion_id];
    return null;
  }

  function lookupPkg(d: OutreachDraftRow): PackageLabel | null {
    if (d.project_package_id && packagesById[d.project_package_id])
      return packagesById[d.project_package_id];
    return null;
  }

  const tabs: Array<{ key: typeof activeTab; label: string; count: number }> = [
    { key: "draft", label: "Drafts", count: counts.draft ?? 0 },
    { key: "sent", label: "Sent", count: counts.sent ?? 0 },
    { key: "replied", label: "Replied", count: counts.replied ?? 0 },
    { key: "archived", label: "Archived", count: counts.archived ?? 0 },
  ];

  if (drafts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
        <Mail className="mx-auto mb-2 h-8 w-8 text-slate-400" />
        <p className="text-sm font-semibold text-slate-700">
          No outreach drafts yet
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Once you have buyer contacts and packages, ask the agent:
          <br />
          <em className="text-slate-600">
            &ldquo;Draft outreach for [buyer name] pitching [package].&rdquo;
          </em>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Tab bar */}
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
              activeTab === tab.key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            {tab.label}
            {tab.count > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                  activeTab === tab.key
                    ? "bg-slate-100 text-slate-700"
                    : "bg-slate-200 text-slate-500",
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-500">
          Nothing in {activeTab} yet.
        </p>
      ) : (
        <div className="space-y-4">
          {groupedList.map((group, gIdx) => {
            const buyer = lookupBuyer(group[0]);
            const pkg = lookupPkg(group[0]);
            return (
              <div key={gIdx} className="space-y-2">
                {group.length > 1 && (
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Variant set ({group.length} messages)
                  </p>
                )}
                {group.map((d) => (
                  <DraftCard
                    key={d.id}
                    draft={d}
                    buyer={buyer}
                    pkg={pkg}
                    onChanged={() => router.refresh()}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
