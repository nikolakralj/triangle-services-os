"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, FileText, Trash2, ExternalLink, AlertTriangle, Clock, CheckCircle2, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CERT_TYPES } from "@/lib/data/worker-documents-types";
import type { WorkerDocument } from "@/lib/data/worker-documents-types";

// ─────────────────────────────────────────────────────────────────────────────
// Expiry badge
// ─────────────────────────────────────────────────────────────────────────────

function ExpiryBadge({ status, expiryDate }: { status: WorkerDocument["expiryStatus"]; expiryDate: string | null }) {
  if (status === "no_expiry") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
        <Minus className="h-3 w-3" />
        No expiry
      </span>
    );
  }
  if (status === "valid") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
        <CheckCircle2 className="h-3 w-3" />
        {expiryDate}
      </span>
    );
  }
  if (status === "expiring_soon") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
        <Clock className="h-3 w-3" />
        Expires {expiryDate}
      </span>
    );
  }
  // expired
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">
      <AlertTriangle className="h-3 w-3" />
      Expired {expiryDate}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main panel
// ─────────────────────────────────────────────────────────────────────────────

export function WorkerCertificatesPanel({ workerId }: { workerId: string }) {
  const [docs, setDocs] = useState<WorkerDocument[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Upload form state
  const [showForm, setShowForm] = useState(false);
  const [certType, setCertType] = useState<string>(CERT_TYPES[0].value);
  const [title, setTitle] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Deletion state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Load docs ──────────────────────────────────────────────────────────────
  const loadDocs = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/workers/${workerId}/documents`);
      if (res.ok) {
        const data: WorkerDocument[] = await res.json();
        setDocs(data);
      }
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [workerId, loading]);

  // Lazy load on first expand, toggle on subsequent clicks
  const handleToggle = () => {
    if (!expanded) {
      if (!loaded && !loading) loadDocs();
      setExpanded(true);
    } else {
      setExpanded(false);
      setShowForm(false);
    }
  };

  // ── Upload ─────────────────────────────────────────────────────────────────
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("certType", certType);
      if (title.trim()) form.append("title", title.trim());
      if (expiryDate) form.append("expiryDate", expiryDate);

      const res = await fetch(`/api/workers/${workerId}/documents`, {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setUploadError((body as { error?: string }).error ?? "Upload failed.");
        return;
      }

      // Reset form and reload
      setCertType(CERT_TYPES[0].value);
      setTitle("");
      setExpiryDate("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      setShowForm(false);
      await loadDocs();
    } finally {
      setUploading(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (docId: string) => {
    if (!confirm("Delete this document? This cannot be undone.")) return;
    setDeletingId(docId);
    try {
      const res = await fetch(`/api/workers/${workerId}/documents/${docId}`, { method: "DELETE" });
      if (res.ok) {
        setDocs((prev) => prev.filter((d) => d.id !== docId));
      }
    } finally {
      setDeletingId(null);
    }
  };

  // ── View (signed URL) ──────────────────────────────────────────────────────
  const handleView = async (docId: string) => {
    const res = await fetch(`/api/documents/${docId}/signed-url`);
    if (!res.ok) return;
    const { signedUrl } = (await res.json()) as { signedUrl: string };
    window.open(signedUrl, "_blank", "noopener,noreferrer");
  };

  // ─────────────────────────────────────────────────────────────────────────
  const certTypeLabel = (value: string) =>
    CERT_TYPES.find((c) => c.value === value)?.label ?? value;

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      {/* Header */}
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        onClick={handleToggle}
      >
        <span className="text-sm font-semibold text-slate-800">
          Certificates &amp; Documents
          {loaded && docs.length > 0 && (
            <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
              {docs.length}
            </span>
          )}
          {loaded && docs.some((d) => d.expiryStatus === "expired") && (
            <span className="ml-2 rounded-full bg-red-100 px-1.5 py-0.5 text-xs text-red-600">
              {docs.filter((d) => d.expiryStatus === "expired").length} expired
            </span>
          )}
          {loaded && docs.some((d) => d.expiryStatus === "expiring_soon") && (
            <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs text-amber-600">
              {docs.filter((d) => d.expiryStatus === "expiring_soon").length} expiring
            </span>
          )}
        </span>
        <span className="text-xs text-slate-400">{expanded ? "▲ collapse" : "▼ expand"}</span>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3">
          {/* Upload button */}
          {!showForm && (
            <Button
              variant="secondary"
              className="mb-3 gap-1.5"
              onClick={() => setShowForm(true)}
            >
              <Upload className="h-3.5 w-3.5" />
              Upload document
            </Button>
          )}

          {/* Upload form */}
          {showForm && (
            <form
              onSubmit={handleUpload}
              className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2"
            >
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                New document
              </p>

              {/* Cert type */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Certificate type *</label>
                <select
                  value={certType}
                  onChange={(e) => setCertType(e.target.value)}
                  className="rounded border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800"
                  required
                >
                  {CERT_TYPES.map((ct) => (
                    <option key={ct.value} value={ct.value}>{ct.label}</option>
                  ))}
                </select>
              </div>

              {/* Title (optional) */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Title (optional — defaults to file name)</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Thomas Schmidt A1 Certificate 2024"
                  className="rounded border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 placeholder:text-slate-400"
                />
              </div>

              {/* Expiry date */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Expiry date (optional)</label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="rounded border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800"
                />
              </div>

              {/* File picker */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">File * (max 10 MB — PDF, PNG, JPG)</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="text-sm text-slate-700"
                  required
                />
              </div>

              {uploadError && (
                <p className="text-xs text-red-600">{uploadError}</p>
              )}

              <div className="flex gap-2 pt-1">
                <Button type="submit" variant="primary" disabled={uploading || !file}>
                  {uploading ? "Uploading…" : "Upload"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => { setShowForm(false); setUploadError(null); }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {/* Document list */}
          {loading && <p className="text-sm text-slate-400">Loading…</p>}
          {!loading && docs.length === 0 && (
            <p className="text-sm text-slate-400">No documents uploaded yet.</p>
          )}
          {!loading && docs.length > 0 && (
            <div className="space-y-2">
              {docs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-start justify-between gap-3 rounded-md border border-slate-100 bg-white p-3"
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <FileText className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{doc.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {certTypeLabel(doc.certType)}
                        {doc.fileSize && ` · ${(doc.fileSize / 1024).toFixed(0)} KB`}
                      </p>
                      <div className="mt-1">
                        <ExpiryBadge status={doc.expiryStatus} expiryDate={doc.expiryDate} />
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <button
                      type="button"
                      title="View"
                      onClick={() => handleView(doc.id)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Delete"
                      onClick={() => handleDelete(doc.id)}
                      disabled={deletingId === doc.id}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
