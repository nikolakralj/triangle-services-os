"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, FileText, Loader2, Upload } from "lucide-react";

// ---------------------------------------------------------------------------
// Drop a CV, get a proposed person.
//
// It stops at the proposal on purpose. A CV says "fluent German, 10 years,
// A1 certified" — that is what the candidate claims, and putting it straight
// into the pool would mean the first time anyone checks is when a client asks
// why the man on their site cannot read the drawings.
// ---------------------------------------------------------------------------

interface Guess {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  certificates: string[];
  languages: string[];
  country: string | null;
}

interface Done {
  fileName: string;
  pages: number;
  characters: number;
  guess: Guess;
}

export function CvUpload() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done[]>([]);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);

    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      try {
        const res = await fetch("/api/workers/cv", { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(`${file.name}: ${data.error ?? "could not be read."}`);
          continue;
        }
        setDone((prev) => [
          {
            fileName: file.name,
            pages: data.pages,
            characters: data.characters,
            guess: data.guess as Guess,
          },
          ...prev,
        ]);
      } catch {
        setError(`${file.name}: network error.`);
      }
    }

    setBusy(false);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        <p className="text-sm font-semibold text-slate-900">Add people from CVs</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Drop one or more PDFs. Each becomes a proposed profile in Approvals —
          nobody joins the pool until you accept them.
        </p>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label
            className={`inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 ${
              busy ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-slate-50"
            }`}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {busy ? "Reading…" : "Choose CVs"}
            <input
              className="hidden"
              type="file"
              accept="application/pdf,.pdf"
              multiple
              disabled={busy}
              onChange={(e) => void upload(e.target.files)}
            />
          </label>
          <span className="text-xs text-slate-400">PDF, up to 15 MB each</span>
        </div>

        {error && (
          <p className="flex items-start gap-1.5 text-sm text-rose-600">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        {done.length > 0 && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-900">
              <CheckCircle2 className="h-4 w-4" />
              {done.length} {done.length === 1 ? "CV" : "CVs"} read and waiting for you
            </p>
            <ul className="mt-2 space-y-2">
              {done.map((d, i) => (
                <li key={i} className="flex items-start gap-2">
                  <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-emerald-900">
                      {d.guess.fullName ?? d.fileName}
                    </p>
                    <p className="text-[11px] text-emerald-800">
                      {[
                        `${d.pages} pages`,
                        d.guess.country,
                        d.guess.email,
                        d.guess.certificates.length
                          ? d.guess.certificates.join(", ")
                          : null,
                        d.guess.languages.length ? d.guess.languages.join(", ") : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <Link
              href="/approvals"
              className="mt-2 inline-block text-xs font-medium text-emerald-800 underline"
            >
              Review in Approvals
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
