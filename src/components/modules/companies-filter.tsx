"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import type { Worker } from "@/lib/types";

export function CompaniesFilterForm({
  statuses,
  sectors,
  countries,
  workers,
  initialSearch,
  initialStatus,
  initialSector,
  initialCountry,
  initialOwnerId,
  initialPriority,
}: {
  statuses: string[];
  sectors: string[];
  countries: string[];
  workers: Worker[];
  initialSearch: string;
  initialStatus: string;
  initialSector: string;
  initialCountry: string;
  initialOwnerId: string;
  initialPriority: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState(initialStatus || "all");
  const [sector, setSector] = useState(initialSector || "all");
  const [country, setCountry] = useState(initialCountry || "all");
  const [ownerId, setOwnerId] = useState(initialOwnerId || "all");
  const [priority, setPriority] = useState(initialPriority || "all");

  const handleFilterChange = () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status !== "all") params.set("status", status);
    if (sector !== "all") params.set("sector", sector);
    if (country !== "all") params.set("country", country);
    if (ownerId !== "all") params.set("ownerId", ownerId);
    if (priority !== "all") params.set("priority", priority);

    const queryString = params.toString();
    router.push(`/companies${queryString ? `?${queryString}` : ""}`);
  };

  const handleReset = () => {
    setSearch("");
    setStatus("all");
    setSector("all");
    setCountry("all");
    setOwnerId("all");
    setPriority("all");
    router.push("/companies");
  };

  return (
    <Card className="mb-4">
      <CardContent className="grid gap-3 lg:grid-cols-6">
        <Input
          placeholder="Search company name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleFilterChange()}
        />
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select value={sector} onChange={(e) => setSector(e.target.value)}>
          <option value="all">All sectors</option>
          {sectors.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="all">All countries</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="all">All priorities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </Select>
        <div className="flex gap-2">
          <Button onClick={handleFilterChange} className="flex-1">
            Filter
          </Button>
          <Button variant="ghost" onClick={handleReset} className="flex-1">
            Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
