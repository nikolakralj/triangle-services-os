"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, FileText, Loader2, Upload } from "lucide-react";

// ---------------------------------------------------------------------------
// Drop a CV, get a person.
//
// The CV is read here and now — role, seniority, skills, tickets — and the
// person lands in the pool. There is no approval step, because confirming that
// a parser found an email address is not a decision, and it was going to be
// asked fifty times over.
//
// What that does NOT skip: a candidate is not placeable. Every matching and
// submission query in this codebase requires an active worker, so vouching for
// somebody before they go in front of a buyer is still a human's call. A CV
// says "fluent German, 10 years, A1 certified" — that is what the person
// claims, and a claim is not a check.
//
// A CV for somebody already on the books updates that person instead of
// creating a second copy of them.
// ---------------------------------------------------------------------------

interface Done {
  fileName: string;
  workerId: string;
  name: string | null;
  role: string | null;
  pages: number;
  read: boolean;
  updatedExisting: boolean;
  concerns: string[];
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
            workerId: data.workerId,
            name: data.name ?? null,
            role: data.role ?? null,
            pages: data.pages,
            read: Boolean(data.read),
            updatedExisting: Boolean(data.updatedExisting),
            concerns: (data.concerns as string[]) ?? [],
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
          Drop one or more PDFs. Each is read and the person goes into the pool
          as a candidate — somebody nobody has vouched for yet, so they cannot be
          matched to a package or sent to a buyer. A CV for someone already on the
          books updates them instead of making a second copy.
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
              {done.filter((d) => !d.updatedExisting).length} added,{" "}
              {done.filter((d) => d.updatedExisting).length} updated
            </p>
            <ul className="mt-2 space-y-2">
              {done.map((d, i) => (
                <li key={i} className="flex items-start gap-2">
                  <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" />
                  <div className="min-w-0">
                    <Link
                      href={`/workers/${d.workerId}`}
                      className="text-xs font-medium text-emerald-900 underline-offset-2 hover:underline"
                    >
                      {d.name ?? d.fileName}
                    </Link>
                    <p className="text-[11px] text-emerald-800">
                      {[
                        d.updatedExisting ? "already on the books — updated" : "added",
                        d.role,
                        `${d.pages} ${d.pages === 1 ? "page" : "pages"}`,
                        // Worth knowing that a profile is thin because the
                        // reading failed, not because the CV was thin.
                        d.read ? null : "read failed — only the basics saved",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {d.concerns.length > 0 && (
                      <p className="text-[11px] text-amber-800">
                        Check: {d.concerns.join("; ")}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <Link
              href="/workers"
              className="mt-2 inline-block text-xs font-medium text-emerald-800 underline"
            >
              Open the Talent Pool
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
