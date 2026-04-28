"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import type { Worker } from "@/lib/types";

export function ContactsFilterForm({
  roleCategories,
  countries,
  workers,
  initialSearch,
  initialRoleCategory,
  initialCountry,
  initialOwnerId,
}: {
  roleCategories: string[];
  countries: string[];
  workers: Worker[];
  initialSearch: string;
  initialRoleCategory: string;
  initialCountry: string;
  initialOwnerId: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch);
  const [roleCategory, setRoleCategory] = useState(
    initialRoleCategory || "all",
  );
  const [country, setCountry] = useState(initialCountry || "all");
  const [ownerId, setOwnerId] = useState(initialOwnerId || "all");

  const handleFilterChange = () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (roleCategory !== "all") params.set("roleCategory", roleCategory);
    if (country !== "all") params.set("country", country);
    if (ownerId !== "all") params.set("ownerId", ownerId);

    const queryString = params.toString();
    router.push(`/contacts${queryString ? `?${queryString}` : ""}`);
  };

  const handleReset = () => {
    setSearch("");
    setRoleCategory("all");
    setCountry("all");
    setOwnerId("all");
    router.push("/contacts");
  };

  return (
    <Card className="mb-4">
      <CardContent className="grid gap-3 lg:grid-cols-5">
        <Input
          placeholder="Search contact, email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleFilterChange()}
        />
        <Select value={roleCategory} onChange={(e) => setRoleCategory(e.target.value)}>
          <option value="all">All role categories</option>
          {roleCategories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
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
        <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
          <option value="all">All owners</option>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.fullName}
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
