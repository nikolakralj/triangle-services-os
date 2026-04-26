"use client";

import Link from "next/link";
import Papa from "papaparse";
import { useMemo, useRef, useState } from "react";
import { Download, Plus, Upload, WandSparkles } from "lucide-react";
import { Badge, priorityIntent } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { COMPANIES_EXPORT_HEADERS } from "@/lib/table-headers";
import type { Company } from "@/lib/types";
import { downloadTextFile, normalizeDomain, toCsv } from "@/lib/utils";

type CsvCompanyRow = {
  name?: string;
  legal_name?: string;
  company_type?: string;
  country?: string;
  city?: string;
  website?: string;
  linkedin_url?: string;
  source_url?: string;
  sectors?: string;
  target_countries?: string;
  notes?: string;
  priority?: string;
  owner?: string;
};

export function CompaniesWorkspace({
  initialCompanies,
  canWrite = true,
  canDelete = false,
}: {
  initialCompanies: Company[];
  canWrite?: boolean;
  canDelete?: boolean;
}) {
  void canWrite; // Reserved for Supabase-backed create/edit controls in next iteration
  void canDelete; // Reserved for delete buttons in next iteration
  const [companies, setCompanies] = useState(initialCompanies);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [owner, setOwner] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    return companies.filter((company) => {
      const haystack = [
        company.name,
        company.country,
        company.city,
        company.companyType,
        company.websiteDomain,
        company.sectors.join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return (
        haystack.includes(query.toLowerCase()) &&
        (status === "all" || company.status === status) &&
        (owner === "all" || company.ownerName === owner)
      );
    });
  }, [companies, owner, query, status]);

  function addDemoCompany(formData: FormData) {
    const website = String(formData.get("website") ?? "");
    const company: Company = {
      id: `company-${Date.now()}`,
      name: String(formData.get("name") ?? "New company"),
      companyType: String(formData.get("companyType") ?? "electrical_contractor"),
      status: "target",
      country: String(formData.get("country") ?? ""),
      city: String(formData.get("city") ?? ""),
      website,
      websiteDomain: normalizeDomain(website),
      sourceUrl: String(formData.get("sourceUrl") ?? ""),
      sectors: String(formData.get("sectors") ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      targetCountries: [],
      priority: "medium",
      leadScore: 0,
      leadScoreReason: "Not scored yet.",
      ownerName: String(formData.get("owner") ?? ""),
      description: "Manually added company.",
      nextActionAt: String(formData.get("nextActionAt") ?? ""),
    };
    setCompanies((current) => [company, ...current]);
    setShowAdd(false);
  }

  function exportCsv() {
    const rows = filtered.map((company) => ({
      name: company.name,
      legal_name: company.legalName ?? "",
      company_type: company.companyType,
      country: company.country,
      city: company.city,
      website: company.website,
      website_domain: company.websiteDomain,
      linkedin_url: company.linkedinUrl ?? "",
      source_url: company.sourceUrl ?? "",
      sectors: company.sectors.join(";"),
      target_countries: company.targetCountries.join(";"),
      status: company.status,
      priority: company.priority,
      owner: company.ownerName ?? "",
      lead_score: company.leadScore,
      notes: company.notes ?? "",
    }));
    downloadTextFile("triangle-companies-export.csv", toCsv(rows));
  }

  function handleImport(file?: File) {
    if (!file) return;
    Papa.parse<CsvCompanyRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        const imported = results.data
          .filter((row) => row.name)
          .map((row, index): Company => {
            const website = row.website ?? "";
            return {
              id: `import-${Date.now()}-${index}`,
              name: row.name ?? "Imported company",
              legalName: row.legal_name,
              companyType: row.company_type ?? "other",
              status: "research",
              country: row.country ?? "",
              city: row.city ?? "",
              website,
              websiteDomain: normalizeDomain(website),
              linkedinUrl: row.linkedin_url,
              sourceUrl: row.source_url,
              sectors: (row.sectors ?? "")
                .split(/[;,]/)
                .map((item) => item.trim())
                .filter(Boolean),
              targetCountries: (row.target_countries ?? "")
                .split(/[;,]/)
                .map((item) => item.trim())
                .filter(Boolean),
              priority:
                row.priority === "high" || row.priority === "critical" || row.priority === "low"
                  ? row.priority
                  : "medium",
              leadScore: 0,
              leadScoreReason: "Imported and waiting for AI score.",
              ownerName: row.owner ?? undefined,
              description: "Imported from CSV.",
              notes: row.notes,
            };
          });
        setCompanies((current) => [...imported, ...current]);
      },
    });
  }

  function scoreSelected() {
    setCompanies((current) =>
      current.map((company) => {
        if (!filtered.some((item) => item.id === company.id)) return company;
        const sectorScore = company.sectors.some((sector) =>
          ["Data center", "MEP", "Electrical installation", "Rail / rolling stock"].includes(sector),
        )
          ? 5
          : 3;
        const geoScore = ["Austria", "Germany", "Netherlands", "Denmark", "Sweden"].includes(
          company.country,
        )
          ? 5
          : 3;
        const typeScore = company.companyType.includes("contractor") || company.companyType.includes("oem")
          ? 5
          : 3;
        const score = Math.min(25, sectorScore + geoScore + typeScore + 4 + 4);
        return {
          ...company,
          leadScore: score,
          priority: score >= 21 ? "critical" : score >= 18 ? "high" : "medium",
          leadScoreReason:
            "Local scoring: target sector, geography, likely manpower need, project evidence and Triangle relevance.",
        };
      }),
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-3 lg:grid-cols-[1fr_180px_180px_auto_auto_auto]">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, website, country, type, sector..."
          />
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="research">Research</option>
            <option value="target">Target</option>
            <option value="contact_found">Contact found</option>
            <option value="contacted">Contacted</option>
            <option value="replied">Replied</option>
            <option value="won">Won</option>
          </Select>
          <Select value={owner} onChange={(event) => setOwner(event.target.value)}>
            <option value="all">All owners</option>
            {Array.from(new Set(initialCompanies.map((c) => c.ownerName).filter(Boolean))).map((name) => (
              <option key={name} value={name as string}>{name as string}</option>
            ))}
          </Select>
          <Button onClick={() => setShowAdd((value) => !value)}>
            <Plus className="h-4 w-4" /> Add
          </Button>
          <Button onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" /> Import
          </Button>
          <Button onClick={exportCsv}>
            <Download className="h-4 w-4" /> Export
          </Button>
          <input
            ref={fileRef}
            className="hidden"
            type="file"
            accept=".csv"
            onChange={(event) => handleImport(event.target.files?.[0])}
          />
        </CardContent>
      </Card>

      {showAdd ? (
        <Card>
          <CardHeader title="Add company" description="Creates a target company in the local workspace preview." />
          <CardContent>
            <form action={addDemoCompany} className="grid gap-3 lg:grid-cols-4">
              <Input name="name" placeholder="Company name" required />
              <Input name="country" placeholder="Country" required />
              <Input name="city" placeholder="City" />
              <Input name="website" placeholder="Website" />
              <Input name="companyType" placeholder="company_type" />
              <Input name="sectors" placeholder="Sectors, comma-separated" />
              <Input name="sourceUrl" placeholder="Source URL" />
              <Input name="nextActionAt" type="date" />
              <Input name="owner" placeholder="Assigned to (name)" />
              <Button className="lg:col-span-1" type="submit" variant="primary">
                Save company
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title={`${filtered.length} companies`}
          description="Desktop-first lead database with CSV import/export and local AI-style scoring."
          action={
            <Button onClick={scoreSelected}>
              <WandSparkles className="h-4 w-4" /> AI score filtered
            </Button>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {COMPANIES_EXPORT_HEADERS.map((header) => (
                  <th key={header} className="border-b border-slate-200 px-4 py-3 font-semibold">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((company) => (
                <tr key={company.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link className="font-semibold text-slate-950 hover:text-sky-700" href={`/companies/${company.id}`}>
                      {company.name}
                    </Link>
                    <div className="text-xs text-slate-500">{company.websiteDomain}</div>
                  </td>
                  <td className="px-4 py-3">{company.companyType}</td>
                  <td className="px-4 py-3">{company.country}</td>
                  <td className="px-4 py-3">{company.city}</td>
                  <td className="px-4 py-3">{company.sectors.slice(0, 2).join(", ")}</td>
                  <td className="px-4 py-3">
                    <Badge intent="info">{company.leadScore || "not scored"}</Badge>
                  </td>
                  <td className="px-4 py-3"><Badge>{company.status}</Badge></td>
                  <td className="px-4 py-3">
                    <Badge intent={priorityIntent(company.priority)}>{company.priority}</Badge>
                  </td>
                  <td className="px-4 py-3">{company.ownerName ?? "—"}</td>
                  <td className="px-4 py-3">{company.nextActionAt ?? "n/a"}</td>
                  <td className="px-4 py-3">{company.lastContactAt ?? "n/a"}</td>
                  <td className="px-4 py-3">
                    <a className="text-sky-700 hover:underline" href={company.website}>
                      Website
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    {company.sourceUrl ? (
                      <a className="text-sky-700 hover:underline" href={company.sourceUrl}>
                        Source
                      </a>
                    ) : (
                      "n/a"
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
