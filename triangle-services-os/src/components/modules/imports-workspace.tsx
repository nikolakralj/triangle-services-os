"use client";

import Papa from "papaparse";
import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/field";

type ImportRow = Record<string, string>;

export function ImportsWorkspace() {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [importType, setImportType] = useState("csv_companies");
  const [message, setMessage] = useState("");

  function parse(file?: File) {
    if (!file) return;
    Papa.parse<ImportRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        setRows(results.data.slice(0, 25));
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Preview" description="Duplicate detection uses website domain or company name + country for companies, and email or full name + company for contacts." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                {Object.keys(rows[0] ?? {}).map((key) => (
                  <th key={key} className="border-b border-slate-200 px-4 py-3">
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
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
    </div>
  );
}
