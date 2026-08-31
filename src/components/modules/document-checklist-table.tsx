"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import type { ChecklistItem } from "@/lib/types";

const STATUSES: ChecklistItem["status"][] = [
  "missing",
  "draft",
  "uploaded",
  "approved",
  "expired",
];

function intent(status: ChecklistItem["status"]) {
  if (status === "missing" || status === "expired") return "danger" as const;
  if (status === "draft" || status === "uploaded") return "warning" as const;
  return "success" as const;
}

export function DocumentChecklistTable({
  initialItems,
  canManage,
}: {
  initialItems: ChecklistItem[];
  canManage: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function updateStatus(id: string, status: ChecklistItem["status"]) {
    setSavingId(id);
    setMessage("");
    try {
      const response = await fetch(`/api/documents/checklist/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setMessage(body.error ?? "Checklist update failed.");
        return;
      }
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, status } : item)),
      );
      setMessage("Checklist updated.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      {message ? (
        <p className="border-b border-slate-100 px-4 py-2 text-sm text-slate-600" role="status">
          {message}
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              {["Item", "Folder", "Status", "Owner", "Review date", "Notes", "Actions"].map(
                (header) => (
                  <th key={header} className="border-b border-slate-200 px-4 py-3">
                    {header}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="px-4 py-3 font-medium">{item.title}</td>
                <td className="px-4 py-3">{item.category}</td>
                <td className="px-4 py-3">
                  {canManage ? (
                    <Select
                      aria-label={`Status for ${item.title}`}
                      value={item.status}
                      disabled={savingId === item.id}
                      onChange={(event) =>
                        updateStatus(
                          item.id,
                          event.target.value as ChecklistItem["status"],
                        )
                      }
                    >
                      {STATUSES.map((status) => (
                        <option
                          key={status}
                          value={status}
                          disabled={
                            !item.linkedDocumentId &&
                            (status === "uploaded" || status === "approved")
                          }
                        >
                          {status}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Badge intent={intent(item.status)}>{item.status}</Badge>
                  )}
                </td>
                <td className="px-4 py-3">{item.ownerName ?? "—"}</td>
                <td className="px-4 py-3">{item.reviewDate ?? "n/a"}</td>
                <td className="px-4 py-3">{item.notes ?? "n/a"}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    {canManage ? (
                      <Link
                        className="inline-flex h-9 items-center rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-800 hover:bg-slate-50"
                        href={`/documents?checklist=${item.id}`}
                      >
                        {item.linkedDocumentId ? "Replace file" : "Upload"}
                      </Link>
                    ) : null}
                    {item.linkedDocumentId ? (
                      <Link
                        className="inline-flex h-9 items-center rounded-md border border-slate-200 px-3 text-sm font-medium text-sky-700 hover:bg-slate-50"
                        href={`/api/documents/${item.linkedDocumentId}/signed-url?redirect=1`}
                        target="_blank"
                      >
                        Open
                      </Link>
                    ) : null}
                    {canManage && item.linkedDocumentId && item.status !== "approved" ? (
                      <Button
                        type="button"
                        disabled={savingId === item.id}
                        onClick={() => updateStatus(item.id, "approved")}
                      >
                        Approve
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500" colSpan={7}>
                  No checklist items are configured for this organization.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
