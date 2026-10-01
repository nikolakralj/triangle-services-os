"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { EditableWords } from "@/components/modules/editable-words";
import type { WhatsAppDraftCard, WhatsAppRecord } from "@/lib/whatsapp/view";

// ---------------------------------------------------------------------------
// The WhatsApp draft, on the case and the person that already hold it.
// Same shape as the letter: edit the words, look once more, press Send.
// Rendering this does not send. Waiting lines have no button.
// ---------------------------------------------------------------------------

export function WhatsAppOnRecord({ record }: { record: WhatsAppRecord }) {
  if (record.drafts.length === 0 && record.waiting.length === 0) return null;
  return (
    <div className="space-y-3">
      {record.waiting.map((line) => (
        <p key={line.id} className="text-[13.5px] leading-relaxed text-slate-700">
          <span className="text-slate-500">{line.at ? `${line.at} · ` : ""}</span>
          WhatsApp from {line.who}: {line.text} No draft yet.
        </p>
      ))}
      {record.drafts.map((draft) => (
        <DraftCard key={draft.id} draft={draft} approvedTemplate={record.approvedTemplate} />
      ))}
    </div>
  );
}

function DraftCard({
  draft,
  approvedTemplate,
}: {
  draft: WhatsAppDraftCard;
  approvedTemplate: string | null;
}) {
  const [words, setWords] = useState(draft.body);
  const [reviewing, setReviewing] = useState(false);
  const canText = draft.windowOpen && words.trim().length > 0;
  const canTemplate = !draft.windowOpen && Boolean(approvedTemplate);

  return (
    <article className="space-y-3 rounded-2xl border border-slate-200 bg-white px-4 py-4">
      <h3 className="text-[14px] font-semibold text-slate-950">WhatsApp to {draft.who}</h3>
      {draft.inboundText ? (
        <p className="text-[13px] leading-relaxed text-slate-600">They wrote: {draft.inboundText}</p>
      ) : null}
      <EditableWords
        value={words}
        original={draft.body}
        onChange={setWords}
        tone="light"
        label="The reply to send"
      />
      {draft.windowOpen ? null : approvedTemplate ? (
        <p className="text-[13px] text-slate-600">
          Outside 24 hours, so Send uses the approved template {approvedTemplate}.
        </p>
      ) : (
        <p className="text-[13px] text-slate-600">
          Outside the 24-hour window. Only an approved template can be sent, and none is configured.
        </p>
      )}
      {canText || canTemplate ? (
        <button
          type="button"
          onClick={() => setReviewing(true)}
          disabled={reviewing}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
        >
          <Send className="h-3.5 w-3.5" />
          Send
        </button>
      ) : null}
      {reviewing ? (
        <Review
          draft={draft}
          words={words}
          approvedTemplate={approvedTemplate}
          onClose={() => setReviewing(false)}
        />
      ) : null}
    </article>
  );
}

function Review({
  draft,
  words,
  approvedTemplate,
  onClose,
}: {
  draft: WhatsAppDraftCard;
  words: string;
  approvedTemplate: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const template = !draft.windowOpen;

  async function send() {
    if (busy || sent) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId: draft.id,
          text: words,
          approve: true,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Not sent.");
        return;
      }
      setSent(true);
      router.refresh();
    } catch {
      setError("Network error. Nothing was recorded as sent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4" role="dialog" aria-label="Review before sending">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
        Once more before it goes
      </p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px] text-slate-800">
        <dt className="text-slate-500">To</dt>
        <dd className="font-mono">{draft.to}</dd>
        <dt className="text-slate-500">What</dt>
        <dd>{template ? `Approved template ${approvedTemplate ?? ""}` : words}</dd>
      </dl>
      {sent ? (
        <p className="mt-3 text-[13px] text-emerald-800">Sent.</p>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" />
            {busy ? "Sending…" : "Send now"}
          </button>
          <button type="button" onClick={onClose} className="rounded-lg px-2.5 py-2 text-[13px] text-slate-500">
            Cancel
          </button>
        </div>
      )}
      {error ? <p className="mt-2 text-[12.5px] text-rose-600">{error}</p> : null}
    </div>
  );
}
