"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";

type ChecklistOption = {
  id: string;
  title: string;
  category: string;
};

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);
}

export function DocumentUploadPanel({
  checklistItems,
  initialChecklistItemId,
}: {
  checklistItems: ChecklistOption[];
  initialChecklistItemId?: string;
}) {
  const router = useRouter();
  const initialItem = checklistItems.find(
    (item) => item.id === initialChecklistItemId,
  );
  const [open, setOpen] = useState(Boolean(initialItem));
  const [checklistItemId, setChecklistItemId] = useState(initialItem?.id ?? "");
  const [title, setTitle] = useState(initialItem?.title ?? "");
  const [documentCategory, setDocumentCategory] = useState(
    initialItem ? slug(initialItem.title) : "",
  );
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  function selectChecklistItem(id: string) {
    setChecklistItemId(id);
    const item = checklistItems.find((candidate) => candidate.id === id);
    if (item) {
      setTitle(item.title);
      setDocumentCategory(slug(item.title));
    }
  }

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setMessage("");
    const form = new FormData(event.currentTarget);
    setUploading(true);
    try {
      const response = await fetch("/api/documents", {
        method: "POST",
        body: form,
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setMessage(body.error ?? "Upload failed.");
        return;
      }

      setMessage("Document uploaded and stored privately.");
      setChecklistItemId("");
      setTitle("");
      setDocumentCategory("");
      formElement.reset();
      router.replace("/documents");
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <Button type="button" variant="primary" onClick={() => setOpen(!open)}>
        <FileUp className="h-4 w-4" />
        {open ? "Close upload" : "Upload document"}
      </Button>
      {open ? (
        <form
          className="mt-3 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-2 xl:grid-cols-4"
          onSubmit={upload}
        >
          <label className="text-sm font-medium text-slate-700 xl:col-span-2">
            Checklist item (optional)
            <Select
              className="mt-1"
              name="checklistItemId"
              value={checklistItemId}
              onChange={(event) => selectChecklistItem(event.target.value)}
            >
              <option value="">No checklist link</option>
              {checklistItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.category} — {item.title}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-sm font-medium text-slate-700 xl:col-span-2">
            File (PDF, image, Office, CSV or text; max 25 MB)
            <Input
              className="mt-1 pt-1.5"
              name="file"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt"
              required
            />
          </label>
          <label className="text-sm font-medium text-slate-700 xl:col-span-2">
            Title
            <Input
              className="mt-1"
              name="title"
              value={title}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </label>
          <label className="text-sm font-medium text-slate-700 xl:col-span-2">
            Document category
            <Input
              className="mt-1"
              name="documentCategory"
              value={documentCategory}
              maxLength={100}
              onChange={(event) => setDocumentCategory(event.target.value)}
              placeholder="company_registration"
              required
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Visibility
            <Select className="mt-1" name="visibility" defaultValue="internal">
              <option value="internal">Internal</option>
              <option value="partner_only">Partner only</option>
              <option value="admin_only">Admin only</option>
              <option value="researcher_allowed">Researcher allowed</option>
            </Select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Sensitivity
            <Select className="mt-1" name="sensitivity" defaultValue="normal">
              <option value="normal">Normal</option>
              <option value="confidential">Confidential</option>
              <option value="highly_confidential">Highly confidential</option>
              <option value="personal_data">Personal data</option>
              <option value="financial">Financial</option>
              <option value="legal">Legal</option>
            </Select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Review date
            <Input className="mt-1" name="reviewDate" type="date" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Expiry date
            <Input className="mt-1" name="expiryDate" type="date" />
          </label>
          <div className="flex items-center gap-3 xl:col-span-4">
            <Button type="submit" variant="primary" disabled={uploading}>
              {uploading ? "Uploading…" : "Store private document"}
            </Button>
            {message ? (
              <p
                className={
                  message.startsWith("Document uploaded")
                    ? "text-sm text-emerald-700"
                    : "text-sm text-rose-700"
                }
                role="status"
              >
                {message}
              </p>
            ) : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}
