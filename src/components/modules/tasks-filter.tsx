"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import type { Worker } from "@/lib/types";

export function TasksFilterForm({
  workers,
  initialSearch,
  initialStatus,
  initialAssignedToId,
  initialPriority,
}: {
  workers: Worker[];
  initialSearch: string;
  initialStatus: string;
  initialAssignedToId: string;
  initialPriority: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState(initialStatus || "all");
  const [assignedToId, setAssignedToId] = useState(initialAssignedToId || "all");
  const [priority, setPriority] = useState(initialPriority || "all");

  const handleFilterChange = () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status !== "all") params.set("status", status);
    if (assignedToId !== "all") params.set("assignedToId", assignedToId);
    if (priority !== "all") params.set("priority", priority);

    const queryString = params.toString();
    router.push(`/tasks${queryString ? `?${queryString}` : ""}`);
  };

  const handleReset = () => {
    setSearch("");
    setStatus("all");
    setAssignedToId("all");
    setPriority("all");
    router.push("/tasks");
  };

  return (
    <Card className="mb-4">
      <CardContent className="grid gap-3 lg:grid-cols-5">
        <Input
          placeholder="Search task..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleFilterChange()}
        />
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
          <option value="cancelled">Cancelled</option>
        </Select>
        <Select
          value={assignedToId}
          onChange={(e) => setAssignedToId(e.target.value)}
        >
          <option value="all">All assignees</option>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.fullName}
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
