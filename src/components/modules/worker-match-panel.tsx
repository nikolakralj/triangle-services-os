"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileDown,
  Loader2,
  Mail,
  Search,
  Send,
  Star,
  UserCheck,
  UserX,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Inline until @/lib/data/worker-matching exports the enriched type.
interface PackageMatchRow {
  id: string;
  packageId: string;
  workerId: string;
  workerName: string;
  workerRole: string;
  workerAvailability: string;
  workerCountry: string;
  workerSkills: string[];
  matchScore: number;
  matchReasons: string[];
  status: "shortlisted" | "submitted" | "rejected" | "placed";
  submittedAt: string | null;
  placedAt: string | null;
  notes: string | null;
  createdAt: string;
}

interface SimplePackage {
  id: string;
  title: string;
  roles: string[];
  estimatedCrewSize: number | null;
}

export interface WorkerMatchPanelProps {
  packages: SimplePackage[];
  initialMatches: Record<string, PackageMatchRow[]>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type BadgeIntent = "neutral" | "info" | "success" | "warning" | "danger" | "purple";

function scoreIntent(score: number): BadgeIntent {
  if (score >= 75) return "success";
  if (score >= 50) return "info";
  return "neutral";
}

function availabilityIntent(availability: string): BadgeIntent {
  if (availability === "available") return "success";
  if (availability === "available_soon") return "warning";
  return "neutral";
}

function availabilityLabel(availability: string): string {
  if (availability === "available") return "Available";
  if (availability === "available_soon") return "Available soon";
  if (availability === "busy") return "Busy";
  return "Unknown";
}

type StatusTab = "shortlisted" | "submitted" | "placed" | "rejected";
const STATUS_TABS: { key: StatusTab; label: string }[] = [
  { key: "shortlisted", label: "Shortlisted" },
  { key: "submitted", label: "Submitted" },
  { key: "placed", label: "Placed" },
  { key: "rejected", label: "Rejected" },
];

// ---------------------------------------------------------------------------
// WorkerMatchCard
// ---------------------------------------------------------------------------

function WorkerMatchCard({
  match,
  packageId,
  onMutated,
}: {
  match: PackageMatchRow;
  packageId: string;
  onMutated: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitNote, setSubmitNote] = useState("");
  const [showSubmitInput, setShowSubmitInput] = useState(false);

  const visibleSkills = match.workerSkills.slice(0, 3);
  const extraSkillCount = match.workerSkills.length - visibleSkills.length;

  async function patch(status: PackageMatchRow["status"], notes?: string) {
    setBusy(status);
    setError(null);
    try {
      const response = await fetch(`/api/packages/${packageId}/match`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: match.id,
          status,
          ...(notes !== undefined ? { notes } : {}),
        }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Action failed. Please try again.");
        return;
      }
      onMutated();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="rounded-md border border-slate-200 bg-white p-3">
      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-950">{match.workerName}</p>
          <p className="text-xs text-slate-500">{match.workerRole}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <Badge intent={scoreIntent(match.matchScore)}>
            <Star className="mr-1 h-3 w-3" />
            {match.matchScore}%
          </Badge>
          <Badge intent={availabilityIntent(match.workerAvailability)}>
            {availabilityLabel(match.workerAvailability)}
          </Badge>
        </div>
      </div>

      {/* Country + skills */}
      <p className="mt-2 text-xs text-slate-600">
        {match.workerCountry}
        {visibleSkills.length > 0 && (
          <>
            {" · "}
            {visibleSkills.join(", ")}
            {extraSkillCount > 0 && (
              <span className="text-slate-400"> +{extraSkillCount} more</span>
            )}
          </>
        )}
      </p>

      {/* Match reasons */}
      {match.matchReasons.length > 0 && (
        <p className="mt-1.5 text-xs italic text-slate-500">
          {match.matchReasons.join(" · ")}
        </p>
      )}

      {/* Notes */}
      {match.notes && (
        <p className="mt-1.5 rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">
          Note: {match.notes}
        </p>
      )}

      {/* Inline submit note input */}
      {showSubmitInput && (
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={submitNote}
            onChange={(e) => setSubmitNote(e.target.value)}
            placeholder="Add a note (optional)"
            className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
          />
          <Button
            variant="primary"
            className="h-7 px-2 text-xs"
            disabled={busy === "submitted"}
            onClick={() => {
              void patch("submitted", submitNote.trim() || undefined);
              setShowSubmitInput(false);
              setSubmitNote("");
            }}
          >
            {busy === "submitted" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            Confirm
          </Button>
          <Button
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => { setShowSubmitInput(false); setSubmitNote(""); }}
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {match.status !== "shortlisted" && match.status !== "placed" && (
          <Button
            variant="ghost"
            className="h-7 px-2 text-xs"
            disabled={!!busy}
            onClick={() => void patch("shortlisted")}
          >
            {busy === "shortlisted" ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3 w-3" />}
            Shortlist
          </Button>
        )}

        {match.status !== "submitted" && match.status !== "placed" && match.status !== "rejected" && (
          <Button
            variant="ghost"
            className="h-7 px-2 text-xs"
            disabled={!!busy}
            onClick={() => setShowSubmitInput(true)}
          >
            <Send className="h-3 w-3" />
            Submit
          </Button>
        )}

        {match.status === "submitted" && (
          <Button
            variant="ghost"
            className="h-7 px-2 text-xs"
            disabled={!!busy}
            onClick={() => void patch("placed")}
          >
            {busy === "placed" ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            Mark placed
          </Button>
        )}

        {match.status !== "rejected" && match.status !== "placed" && (
          <Button
            variant="danger"
            className="h-7 px-2 text-xs"
            disabled={!!busy}
            onClick={() => void patch("rejected")}
          >
            {busy === "rejected" ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserX className="h-3 w-3" />}
            Reject
          </Button>
        )}
      </div>

      {/* Inline error */}
      {error && (
        <p className="mt-2 flex items-center gap-1 text-xs text-rose-600">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error}
        </p>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// PackageSection
// ---------------------------------------------------------------------------

function PackageSection({
  pkg,
  matches: initialMatches,
}: {
  pkg: SimplePackage;
  matches: PackageMatchRow[];
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<StatusTab>("shortlisted");
  const [open, setOpen] = useState(true);
  const [finding, setFinding] = useState(false);
  const [findError, setFindError] = useState<string | null>(null);
  const [findNotice, setFindNotice] = useState<string | null>(null);
  const hasRoles = pkg.roles.length > 0;
  const [packet, setPacket] = useState<string | null>(null);
  const [generatingPacket, setGeneratingPacket] = useState(false);
  const [packetCopied, setPacketCopied] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Send tracking state
  type SendRecord = { id: string; contactName: string | null; contactCompany: string | null; channel: string; status: string; sentAt: string; placementFeeEur: number | null };
  const [sends, setSends] = useState<SendRecord[]>([]);
  const [sendsLoaded, setSendsLoaded] = useState(false);
  const [logForm, setLogForm] = useState({ contactName: "", contactEmail: "", contactCompany: "", channel: "email", notes: "" });
  const [loggingSend, setLoggingSend] = useState(false);
  const [updatingSendId, setUpdatingSendId] = useState<string | null>(null);

  const tabCounts: Record<StatusTab, number> = {
    shortlisted: initialMatches.filter((m) => m.status === "shortlisted").length,
    submitted: initialMatches.filter((m) => m.status === "submitted").length,
    placed: initialMatches.filter((m) => m.status === "placed").length,
    rejected: initialMatches.filter((m) => m.status === "rejected").length,
  };

  const visibleMatches = initialMatches.filter((m) => m.status === activeTab);
  const hasAnyMatches = initialMatches.length > 0;

  async function findWorkers() {
    // Guard: matching scores against package roles. With no roles defined,
    // every worker scores 0 and the result is an empty list — which used to
    // look like a silent failure. Tell the user why instead of running it.
    if (!hasRoles) {
      setFindNotice(
        "This package has no roles defined, so there's nothing to match workers against. Add roles to the package (e.g. via the Project Agent) and try again.",
      );
      setFindError(null);
      return;
    }
    setFinding(true);
    setFindError(null);
    setFindNotice(null);
    try {
      const response = await fetch(`/api/packages/${pkg.id}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setFindError(data.error ?? "Matching failed. Please try again.");
        return;
      }
      const data = (await response.json().catch(() => ({}))) as { count?: number };
      if ((data.count ?? 0) === 0) {
        setFindNotice(
          `No workers matched this package's roles (${pkg.roles.join(", ")}). Check that your roster has active workers with matching roles or skills.`,
        );
      }
      router.refresh();
    } catch {
      setFindError("Network error. Please try again.");
    } finally {
      setFinding(false);
    }
  }

  async function generatePacket() {
    setGeneratingPacket(true);
    setPacket(null);
    setPacketCopied(false);
    try {
      const response = await fetch(`/api/packages/${pkg.id}/submission-packet`);
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setPacket(`# Error\n\n${data.error ?? "Failed to generate packet."}`);
        return;
      }
      const data = (await response.json()) as { markdown: string };
      setPacket(data.markdown);
    } catch {
      setPacket("# Error\n\nNetwork error. Please try again.");
    } finally {
      setGeneratingPacket(false);
    }
  }

  async function copyPacket() {
    if (!packet) return;
    try {
      await navigator.clipboard.writeText(packet);
      setPacketCopied(true);
      setTimeout(() => setPacketCopied(false), 2000);
    } catch {
      // clipboard blocked; user can select manually
    }
  }

  async function downloadPdf() {
    setDownloadingPdf(true);
    try {
      const response = await fetch(`/api/packages/${pkg.id}/submission-packet/pdf`);
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        alert(data.error ?? "PDF generation failed. Please try again.");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `crew-submission-${pkg.id.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("Network error generating PDF. Please try again.");
    } finally {
      setDownloadingPdf(false);
    }
  }

  async function loadSends() {
    if (sendsLoaded) return;
    const res = await fetch(`/api/packages/${pkg.id}/sends`).catch(() => null);
    if (res?.ok) {
      const data = (await res.json()) as SendRecord[];
      setSends(data);
    }
    setSendsLoaded(true);
  }

  async function logSend() {
    if (!logForm.contactName.trim()) return;
    setLoggingSend(true);
    try {
      const res = await fetch(`/api/packages/${pkg.id}/sends`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(logForm),
      });
      if (res.ok) {
        const newSend = (await res.json()) as SendRecord;
        setSends((prev) => [newSend, ...prev]);
        setLogForm({ contactName: "", contactEmail: "", contactCompany: "", channel: "email", notes: "" });
      }
    } finally {
      setLoggingSend(false);
    }
  }

  async function updateSendStatus(sendId: string, status: string) {
    setUpdatingSendId(sendId);
    try {
      const res = await fetch(`/api/packages/${pkg.id}/sends/${sendId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, repliedAt: status !== "sent" ? new Date().toISOString() : null }),
      });
      if (res.ok) {
        const updated = (await res.json()) as SendRecord;
        setSends((prev) => prev.map((s) => (s.id === sendId ? updated : s)));
      }
    } finally {
      setUpdatingSendId(null);
    }
  }

  return (
    <Card>
      <div className="flex w-full items-center gap-3 border-b border-slate-100 p-4">
        <button
          type="button"
          className="min-w-0 flex-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
        >
          <h3 className="text-sm font-semibold text-slate-950">{pkg.title}</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {pkg.roles.length > 0 ? pkg.roles.join(", ") : "No roles defined"}
            {pkg.estimatedCrewSize !== null ? ` · Crew: ${pkg.estimatedCrewSize}` : ""}
          </p>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="secondary"
            className="h-8 px-3 text-xs"
            disabled={finding}
            onClick={() => void findWorkers()}
          >
            {finding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            Find workers
          </Button>
          <button
            type="button"
            aria-label={open ? "Collapse package" : "Expand package"}
            aria-expanded={open}
            className="rounded p-1 text-slate-400 hover:bg-slate-100"
            onClick={() => setOpen((prev) => !prev)}
          >
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {findError && (
        <div className="flex items-center gap-2 border-b border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-700">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {findError}
        </div>
      )}

      {findNotice && (
        <div className="flex items-start gap-2 border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {findNotice}
        </div>
      )}

      {open && (
        <CardContent className="space-y-3 pt-3">
          {!hasAnyMatches ? (
            <p className="py-4 text-center text-sm text-slate-500">
              No matches yet. Click &ldquo;Find workers&rdquo; to run matching.
            </p>
          ) : (
            <>
              {/* Status tabs */}
              <div className="flex gap-1 border-b border-slate-100">
                {STATUS_TABS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveTab(key)}
                    className={[
                      "relative -mb-px px-3 py-2 text-xs font-medium transition",
                      activeTab === key
                        ? "border-b-2 border-slate-900 text-slate-900"
                        : "text-slate-500 hover:text-slate-700",
                    ].join(" ")}
                  >
                    {label}
                    {tabCounts[key] > 0 && (
                      <span className={[
                        "ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium",
                        activeTab === key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600",
                      ].join(" ")}>
                        {tabCounts[key]}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {visibleMatches.length === 0 ? (
                <p className="py-3 text-center text-xs text-slate-400">
                  No workers in this status.
                </p>
              ) : (
                <div className="space-y-2">
                  {visibleMatches.map((match) => (
                    <WorkerMatchCard
                      key={match.id}
                      match={match}
                      packageId={pkg.id}
                      onMutated={() => router.refresh()}
                    />
                  ))}
                </div>
              )}

              {/* Submission packet generator — only shown when workers are in Submitted or Placed */}
              {(activeTab === "submitted" || activeTab === "placed") && visibleMatches.length > 0 && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-slate-700">
                        Buyer submission packet
                      </p>
                      <p className="text-xs text-slate-500">
                        Generate a markdown crew offer you can paste into email or Word.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="primary"
                        className="h-8 px-3 text-xs"
                        disabled={generatingPacket}
                        onClick={() => void generatePacket()}
                      >
                        {generatingPacket ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        Generate packet
                      </Button>
                      {packet && (
                        <Button
                          variant="secondary"
                          className="h-8 px-3 text-xs"
                          onClick={() => void copyPacket()}
                        >
                          {packetCopied ? (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          ) : null}
                          {packetCopied ? "Copied" : "Copy"}
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        className="h-8 px-3 text-xs"
                        disabled={downloadingPdf}
                        onClick={() => void downloadPdf()}
                      >
                        {downloadingPdf ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <FileDown className="h-3.5 w-3.5" />
                        )}
                        {downloadingPdf ? "Generating…" : "Download PDF"}
                      </Button>
                    </div>
                  </div>
                  {packet && (
                    <pre className="mt-3 max-h-72 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-800 whitespace-pre-wrap">
                      {packet}
                    </pre>
                  )}
                </div>
              )}

              {/* ── Send tracking ─────────────────────────────────── */}
              {(activeTab === "submitted" || activeTab === "placed") && visibleMatches.length > 0 && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    className="mb-3 flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900"
                    onClick={() => void loadSends()}
                  >
                    <Mail className="h-3.5 w-3.5" />
                    Send log {sends.length > 0 && `(${sends.length})`}
                  </button>

                  {sendsLoaded && (
                    <>
                      {/* Log form */}
                      <div className="mb-3 rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
                        <p className="text-xs font-medium text-slate-600">Log this send</p>
                        <div className="flex flex-wrap gap-2">
                          <input
                            placeholder="Contact name *"
                            value={logForm.contactName}
                            onChange={(e) => setLogForm((f) => ({ ...f, contactName: e.target.value }))}
                            className="h-7 flex-1 min-w-32 rounded border border-slate-200 bg-white px-2 text-xs focus:outline-none focus:ring-1 focus:ring-sky-400"
                          />
                          <input
                            placeholder="Company"
                            value={logForm.contactCompany}
                            onChange={(e) => setLogForm((f) => ({ ...f, contactCompany: e.target.value }))}
                            className="h-7 flex-1 min-w-28 rounded border border-slate-200 bg-white px-2 text-xs focus:outline-none focus:ring-1 focus:ring-sky-400"
                          />
                          <input
                            placeholder="Email"
                            value={logForm.contactEmail}
                            onChange={(e) => setLogForm((f) => ({ ...f, contactEmail: e.target.value }))}
                            className="h-7 flex-1 min-w-36 rounded border border-slate-200 bg-white px-2 text-xs focus:outline-none focus:ring-1 focus:ring-sky-400"
                          />
                          <select
                            value={logForm.channel}
                            onChange={(e) => setLogForm((f) => ({ ...f, channel: e.target.value }))}
                            className="h-7 rounded border border-slate-200 bg-white px-2 text-xs focus:outline-none focus:ring-1 focus:ring-sky-400"
                          >
                            <option value="email">Email</option>
                            <option value="linkedin">LinkedIn</option>
                            <option value="whatsapp">WhatsApp</option>
                            <option value="other">Other</option>
                          </select>
                          <Button
                            variant="primary"
                            className="h-7 px-3 text-xs"
                            disabled={loggingSend || !logForm.contactName.trim()}
                            onClick={() => void logSend()}
                          >
                            {loggingSend ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                            Log send
                          </Button>
                        </div>
                      </div>

                      {/* Send history */}
                      {sends.length > 0 && (
                        <div className="space-y-1.5">
                          {sends.map((s) => {
                            const statusColors: Record<string, string> = {
                              sent: "bg-slate-100 text-slate-600",
                              replied_interested: "bg-emerald-100 text-emerald-700",
                              replied_not_interested: "bg-rose-100 text-rose-700",
                              negotiating: "bg-amber-100 text-amber-700",
                              placed: "bg-purple-100 text-purple-700",
                              ghosted: "bg-slate-100 text-slate-400",
                            };
                            const statusLabel: Record<string, string> = {
                              sent: "Sent",
                              replied_interested: "Interested",
                              replied_not_interested: "Not interested",
                              negotiating: "Negotiating",
                              placed: "Placed ✓",
                              ghosted: "Ghosted",
                            };
                            return (
                              <div key={s.id} className="flex items-center justify-between gap-2 rounded border border-slate-100 bg-white px-3 py-2">
                                <div className="min-w-0">
                                  <p className="text-xs font-medium text-slate-800 truncate">
                                    {s.contactName ?? "—"}
                                    {s.contactCompany && <span className="text-slate-400"> · {s.contactCompany}</span>}
                                  </p>
                                  <p className="text-xs text-slate-400">
                                    {s.channel} · {new Date(s.sentAt).toLocaleDateString()}
                                    {s.placementFeeEur && <span className="text-purple-600 font-medium"> · €{s.placementFeeEur.toLocaleString()}</span>}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[s.status] ?? statusColors.sent}`}>
                                    {statusLabel[s.status] ?? s.status}
                                  </span>
                                  <select
                                    disabled={updatingSendId === s.id}
                                    value={s.status}
                                    onChange={(e) => void updateSendStatus(s.id, e.target.value)}
                                    className="h-6 rounded border border-slate-200 bg-white px-1 text-xs focus:outline-none"
                                  >
                                    <option value="sent">Sent</option>
                                    <option value="replied_interested">Replied — interested</option>
                                    <option value="replied_not_interested">Replied — not interested</option>
                                    <option value="negotiating">Negotiating</option>
                                    <option value="placed">Placed</option>
                                    <option value="ghosted">Ghosted</option>
                                  </select>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {sends.length === 0 && (
                        <p className="text-xs text-slate-400 italic">No sends logged yet.</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// WorkerMatchPanel (exported)
// ---------------------------------------------------------------------------

export function WorkerMatchPanel({ packages, initialMatches }: WorkerMatchPanelProps) {
  if (packages.length === 0) {
    return (
      <Card>
        <CardHeader
          title="Worker matching"
          description="No packages defined for this project yet. Ask the agent to identify package opportunities."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {packages.map((pkg) => (
        <PackageSection
          key={pkg.id}
          pkg={pkg}
          matches={initialMatches[pkg.id] ?? []}
        />
      ))}
    </div>
  );
}
