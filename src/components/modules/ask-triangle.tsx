"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ContextualType } from "@/lib/data/contextual-work-shared";

export function AskTriangle({
  contextType,
  contextId,
  placeholder = "Ask Triangle… Scout, investigate the end client.",
}: {
  contextType: ContextualType;
  contextId: string;
  placeholder?: string;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit() {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text.trim(),
          context: { type: contextType, id: contextId },
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        kind?: string;
        employeeName?: string;
        missionCreated?: boolean;
        notice?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not start that work.");
        return;
      }
      if (data.kind === "contextual") {
        setNotice(
          `${data.employeeName ?? "An employee"} has the work. No Mission was created.`,
        );
        setText("");
        router.refresh();
        return;
      }
      setError("That request started a Mission. Use a named employee from this item instead.");
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        Ask Triangle
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-y rounded-md border border-slate-200 px-2.5 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !busy) {
            e.preventDefault();
            void submit();
          }
        }}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          className="h-7 px-2.5 text-xs"
          disabled={busy || !text.trim()}
          onClick={() => void submit()}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          Assign
        </Button>
        <span className="text-[11px] text-slate-500">
          Name Scout, Hanna or Bob. This stays on this item — not a new Mission.
        </span>
      </div>
      {notice && <p className="mt-2 text-xs text-emerald-700">{notice}</p>}
      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
