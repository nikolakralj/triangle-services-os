"use client";

import Papa from "papaparse";
import { useCallback, useEffect, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type ImportRow = Record<string, string>;
type DatabaseImportRow = {
  id: string;
  raw_data: Record<string, unknown>;
  normalized_data: {
    lead_score?: number;
    [key: string]: unknown;
  } | null;
  status: string;
};

export function ImportsWorkspace() {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [previewRows, setPreviewRows] = useState<ImportRow[]>([]);
  const [importType, setImportType] = useState("csv_companies");
  const [message, setMessage] = useState("");
  const [dbRows, setDbRows] = useState<DatabaseImportRow[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const supabase = createBrowserSupabaseClient();

  const fetchImportRows = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("import_rows")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setDbRows(data as DatabaseImportRow[]);
  }, [supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchImportRows();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchImportRows]);

  async function handleAIProcess(id: string) {
    setProcessingId(id);
    const { processImportRow } = await import("@/app/(app)/imports/actions");
    const result = await processImportRow(id);
    setProcessingId(null);
    if (result?.error) {
      alert(result.error);
    } else {
      fetchImportRows();
    }
  }

  async function handleApprove(id: string) {
    setProcessingId(id);
    const { approveImportRow } = await import("@/app/(app)/imports/actions");
    const result = await approveImportRow(id);
    setProcessingId(null);
    if (result?.error) {
      alert(result.error);
    } else {
      fetchImportRows();
    }
  }

  function parse(file?: File) {
    if (!file) return;
    Papa.parse<ImportRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        setRows(results.data);
        setPreviewRows(results.data.slice(0, 25));
        setMessage(`${results.data.length} rows parsed. Previewing first 25.`);
      },
    });
  }

  async function sendToApi() {
    const response = await fetch("/api/import/csv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ importType, rows }),
    });
    const data = await response.json();
    setMessage(response.ok ? data.message : data.error);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="CSV import"
          description="Map and import companies or contacts. The API stores import batches when Supabase is configured."
        />
        <CardContent className="flex flex-wrap items-center gap-3">
          <Select className="max-w-56" value={importType} onChange={(event) => setImportType(event.target.value)}>
            <option value="csv_companies">Companies</option>
            <option value="csv_contacts">Contacts</option>
          </Select>
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Upload className="h-4 w-4" />
            Choose CSV
            <input className="hidden" type="file" accept=".csv" onChange={(event) => parse(event.target.files?.[0])} />
          </label>
          <Button onClick={sendToApi} disabled={!rows.length} variant="primary">
            Save import batch
          </Button>
          {message ? <span className="text-sm text-slate-600">{message}</span> : null}
          {rows.length > previewRows.length ? (
            <span className="text-sm font-medium text-slate-700">
              Saving all {rows.length} rows, not only preview.
            </span>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Preview" description="Duplicate detection uses website domain or company name + country for companies, and email or full name + company for contacts." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                {Object.keys(previewRows[0] ?? {}).map((key) => (
                  <th key={key} className="border-b border-slate-200 px-4 py-3">
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, index) => (
                <tr key={index} className="border-b border-slate-100">
                  {Object.values(row).map((value, valueIndex) => (
                    <td key={valueIndex} className="px-4 py-3 text-slate-700">
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card>
        <CardHeader title="Review External Leads" description="Leads gathered by external scrapers. Process them with AI to enrich data before saving to companies." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 border-b border-slate-200">Source</th>
                <th className="px-4 py-3 border-b border-slate-200">Raw Data Snapshot</th>
                <th className="px-4 py-3 border-b border-slate-200">AI Score</th>
                <th className="px-4 py-3 border-b border-slate-200">Status</th>
                <th className="px-4 py-3 border-b border-slate-200">Action</th>
              </tr>
            </thead>
            <tbody>
              {dbRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-slate-500">
                    No pending leads found. Ensure your web scraper is sending data to the webhook.
                  </td>
                </tr>
              ) : null}
              {dbRows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="px-4 py-3 text-slate-700">
                    {typeof row.raw_data.source_url === "string" ? row.raw_data.source_url : "Direct API"}
                  </td>
                  <td className="px-4 py-3 text-slate-700 max-w-xs truncate">
                    {JSON.stringify(row.raw_data).substring(0, 80)}...
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {row.normalized_data?.lead_score ? (
                      <span className={row.normalized_data.lead_score >= 80 ? "text-green-600" : "text-amber-600"}>
                        {row.normalized_data.lead_score}
                      </span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${row.status === 'created' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-800'}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 flex items-center gap-2">
                    <Button 
                      variant="secondary" 
                      onClick={() => handleAIProcess(row.id)}
                      disabled={processingId === row.id || row.status === "created"}
                    >
                      {processingId === row.id ? "Evaluating..." : row.normalized_data?.lead_score ? "Re-evaluate" : "Evaluate via AI"}
                    </Button>
                    {row.normalized_data && row.status !== "created" && (
                      <Button
                        variant="primary"
                        onClick={() => handleApprove(row.id)}
                        disabled={processingId === row.id}
                      >
                        Approve
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
