"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";

export function WorkersFilterForm({
  roles,
  skills,
  countries,
  initialSearch,
  initialRole,
  initialAvailability,
  initialCountry,
  initialSkill,
}: {
  roles: string[];
  skills: string[];
  countries: string[];
  initialSearch: string;
  initialRole: string;
  initialAvailability: string;
  initialCountry: string;
  initialSkill: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch);
  const [role, setRole] = useState(initialRole || "all");
  const [availability, setAvailability] = useState(initialAvailability || "all");
  const [country, setCountry] = useState(initialCountry || "all");
  const [skill, setSkill] = useState(initialSkill || "all");

  const handleFilterChange = () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (role !== "all") params.set("role", role);
    if (availability !== "all") params.set("availability", availability);
    if (country !== "all") params.set("country", country);
    if (skill !== "all") params.set("skill", skill);

    const queryString = params.toString();
    router.push(`/workers${queryString ? `?${queryString}` : ""}`);
  };

  const handleReset = () => {
    setSearch("");
    setRole("all");
    setAvailability("all");
    setCountry("all");
    setSkill("all");
    router.push("/workers");
  };

  return (
    <Card className="mb-4">
      <CardContent className="grid gap-3 lg:grid-cols-6">
        <Input
          placeholder="Search worker..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleFilterChange()}
        />
        <Select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="all">All roles</option>
          {roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
        <Select
          value={availability}
          onChange={(e) => setAvailability(e.target.value)}
        >
          <option value="all">All availability</option>
          <option value="available">Available</option>
          <option value="available_soon">Available Soon</option>
          <option value="busy">Busy</option>
          <option value="unknown">Unknown</option>
        </Select>
        <Select value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="all">All countries</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Select value={skill} onChange={(e) => setSkill(e.target.value)}>
          <option value="all">All skills</option>
          {skills.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
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
