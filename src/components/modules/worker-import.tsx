"use client";

import Papa from "papaparse";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkerFieldKey } from "@/lib/data/worker-import";

// ---------------------------------------------------------------------------
// Drop a roster in, get workers out.
//
// Three steps, because the middle one is the one that was missing: choose the
// file, check what it is about to do, then do it. The old importer skipped
// straight from "chosen" to "accepted" and wrote nothing.
// ---------------------------------------------------------------------------

const FIELD_OPTIONS: Array<{ value: WorkerFieldKey | ""; label: string }> = [
  { value: "", label: "— ignore this column —" },
  { value: "full_name", label: "Full name (required)" },
  { value: "role", label: "Role / trade" },
  { value: "worker_type", label: "Worker type" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "country", label: "Country" },
  { value: "city", label: "City" },
  { value: "languages", label: "Languages" },
  { value: "skills", label: "Skills" },
  { value: "certificates", label: "Certificates" },
  { value: "industries", label: "Industries" },
  { value: "availability_status", label: "Availability" },
  { value: "available_from", label: "Available from" },
  { value: "preferred_countries", label: "Preferred countries" },
  { value: "hourly_rate_expectation", label: "Hourly rate" },
  { value: "daily_rate_expectation", label: "Daily rate" },
  { value: "currency", label: "Currency" },
  { value: "has_passport", label: "Has passport" },
  { value: "has_a1_possible", label: "A1 possible" },
  { value: "has_own_tools", label: "Own tools" },
  { value: "has_car", label: "Has car" },
  { value: "notes", label: "Notes" },
];

type Row = Record<string, string>;
type Mapping = Record<string, WorkerFieldKey | "">;

interface PreviewRow {
  rowNumber: number;
  action: "create" | "update" | "skip";
  fullName: string;
  skipReason: string | null;
  warnings: string[];
  values: Record<string, unknown>;
}

interface Preview {
  counts: { create: number; update: number; skip: number };
  unmappedHeaders: string[];
  rows: PreviewRow[];
  totalRows: number;
}

interface Result {
  created: number;
  updated: number;
  skipped: number;
  failed: Array<{ rowNumber: number; fullName: string; error: string }>;
}

const ACTION_STYLE: Record<string, string> = {
  create: "bg-emerald-50 text-emerald-700",
  update: "bg-sky-50 text-sky-700",
  skip: "bg-slate-100 text-slate-500",
};

function summarise(values: Record<string, unknown>): string {
  const bits: string[] = [];
  if (values.role) bits.push(String(values.role));
  if (Array.isArray(values.skills) && values.skills.length)
    bits.push(`${values.skills.length} skills`);
  if (Array.isArray(values.certificates) && values.certificates.length)
    bits.push((values.certificates as string[]).join(", "));
  if (values.country) bits.push(String(values.country));
  if (values.availability_status) bits.push(String(values.availability_status).replace("_", " "));
  return bits.join(" · ");
}

export function WorkerImport() {
  const router = useRouter();
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setHeaders([]);
    setRows([]);
    setMapping({});
    setPreview(null);
    setResult(null);
    setError(null);
  }

  function onFile(file?: File) {
    if (!file) return;
    reset();
    setFileName(file.name);
    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (out) => {
        const hdrs = (out.meta.fields ?? []).filter(Boolean);
        const data = out.data.filter((r) =>
          Object.values(r).some((v) => String(v ?? "").trim()),
        );
        if (hdrs.length === 0 || data.length === 0) {
          setError("That file has no readable rows. Is the first line the column headers?");
          return;
        }
        setHeaders(hdrs);
        setRows(data);
        try {
          const res = await fetch("/api/import/workers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "guess", headers: hdrs }),
          });
          const d = (await res.json()) as { mapping?: Mapping; error?: string };
          setMapping(d.mapping ?? {});
        } catch {
          setMapping(Object.fromEntries(hdrs.map((h) => [h, ""])) as Mapping);
        }
      },
      error: () => setError("Could not read that file."),
    });
  }

  async function call(mode: "preview" | "commit") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/import/workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, rows, mapping }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      if (mode === "preview") setPreview(data as Preview);
      else {
        setResult(data as Result);
        setPreview(null);
        router.refresh();
      }
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  const nameMapped = Object.values(mapping).includes("full_name");

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        <p className="text-sm font-semibold text-slate-900">Import workers from a spreadsheet</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Save your roster as CSV and drop it here. You will see exactly what
          will happen before anything is written.
        </p>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Upload className="h-4 w-4" />
            Choose CSV
            <input
              className="hidden"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </label>
          {fileName && (
            <span className="text-xs text-slate-500">
              {fileName}
              {rows.length > 0 ? ` · ${rows.length} rows` : ""}
            </span>
          )}
        </div>

        {error && (
          <p className="flex items-start gap-1.5 text-sm text-rose-600">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        {/* Step 2 — mapping */}
        {headers.length > 0 && !result && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              What each column means
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {headers.map((h) => (
                <div key={h} className="flex items-center gap-2">
                  <span
                    className="w-2/5 shrink-0 truncate text-xs text-slate-600"
                    title={h}
                  >
                    {h}
                  </span>
                  <select
                    value={mapping[h] ?? ""}
                    onChange={(e) => {
                      setMapping((m) => ({
                        ...m,
                        [h]: e.target.value as WorkerFieldKey | "",
                      }));
                      setPreview(null);
                    }}
                    className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  >
                    {FIELD_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {!nameMapped && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700">
                <AlertCircle className="h-3.5 w-3.5" />
                Point one column at <strong>Full name</strong> before continuing.
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={busy || !nameMapped}
                onClick={() => void call("preview")}
              >
                {busy && !preview ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Check what will happen
              </Button>
            </div>
          </div>
        )}

        {/* Step 3 — preview */}
        {preview && (
          <div className="rounded-lg border border-slate-200">
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-3 py-2 text-xs">
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                {preview.counts.create} new
              </span>
              <span className="rounded-full bg-sky-50 px-2 py-0.5 font-medium text-sky-700">
                {preview.counts.update} updated
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                {preview.counts.skip} skipped
              </span>
              {preview.unmappedHeaders.length > 0 && (
                <span className="text-slate-400">
                  ignoring: {preview.unmappedHeaders.join(", ")}
                </span>
              )}
            </div>

            <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
              {preview.rows.map((r) => (
                <li key={r.rowNumber} className="flex items-start gap-2 px-3 py-2">
                  <span
                    className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${ACTION_STYLE[r.action]}`}
                  >
                    {r.action}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-slate-800">
                      {r.fullName || <span className="text-slate-400">(no name)</span>}
                    </p>
                    {summarise(r.values) && (
                      <p className="truncate text-[11px] text-slate-500">
                        {summarise(r.values)}
                      </p>
                    )}
                    {r.skipReason && (
                      <p className="text-[11px] text-slate-500">{r.skipReason}</p>
                    )}
                    {r.warnings.map((w, i) => (
                      <p key={i} className="text-[11px] text-amber-700">
                        {w}
                      </p>
                    ))}
                  </div>
                </li>
              ))}
            </ul>

            {preview.totalRows > preview.rows.length && (
              <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
                Showing the first {preview.rows.length} of {preview.totalRows} rows. All
                of them will be imported.
              </p>
            )}

            <div className="border-t border-slate-100 px-3 py-2">
              <Button
                variant="primary"
                disabled={busy || preview.counts.create + preview.counts.update === 0}
                onClick={() => void call("commit")}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Import {preview.counts.create + preview.counts.update} workers
              </Button>
            </div>
          </div>
        )}

        {/* Done */}
        {result && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-900">
              <CheckCircle2 className="h-4 w-4" />
              {result.created} added, {result.updated} updated
              {result.skipped > 0 ? `, ${result.skipped} skipped` : ""}.
            </p>
            {result.failed.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-rose-700">
                  {result.failed.length} could not be saved:
                </p>
                <ul className="mt-1 space-y-0.5">
                  {result.failed.slice(0, 10).map((f, i) => (
                    <li key={i} className="text-[11px] text-rose-700">
                      Row {f.rowNumber} {f.fullName}: {f.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <a
              href="/workers"
              className="mt-2 inline-block text-xs font-medium text-emerald-800 underline"
            >
              Open the Talent Pool
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
