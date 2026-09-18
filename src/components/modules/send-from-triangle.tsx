"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Send } from "lucide-react";
import {
  mayAttachPack,
  PACK_NOT_APPROVED,
  PACK_SUPERSEDED,
  type PackApproval,
  type PackIntent,
} from "@/lib/data/put-forward";

// ---------------------------------------------------------------------------
// Send from Triangle (DEV-013 + packet attach).
//
// Review, edit, press Send. The words in the card's editor are what goes;
// the person sees To / From / Subject and the text once more, then presses
// Send now. The server sends through the person's own mailbox and only then
// records it. If the mailbox's server refuses, nothing is recorded as sent.
//
// Nothing here asks the person to pick what the team already decided
// ("Employees, not buttons", 18 September):
//
//   - who the reply is about is the team's decision, on the card — change it
//     with the one Ask, not with a radio list here;
//   - the From address is the mailbox the recruiter wrote to, said in words.
//     Only when Triangle cannot tell does a choice appear;
//   - the approved document goes with the reply, named, because approving it
//     on the case was the person's decision. It can still be taken off. The
//     server re-reads the approval anyway: an unapproved, lapsed or other-case
//     document is refused and nothing is sent.
//
// Rendered only when the person has a mailbox with sending turned on; with
// none, Open mail stays the way out and this component renders nothing.
// ---------------------------------------------------------------------------

/** The approved profile on this case, as the Send review needs to know it. */
export interface AttachablePack {
  assignmentId: string;
  approval: PackApproval;
  intent: PackIntent;
  /** "M. P." on a bio; the name once identity has been released. */
  who: string;
  filename: string;
  href: string;
  agentName: string;
  approvedAt: string | null;
}

export interface SendTarget {
  to: string;
  subject: string | null;
  /** The words as they stand in the editor. */
  body: string;
  /** The words as Triangle wrote them. */
  draft: string | null;
  who: string;
  leadId?: string;
  contactId?: string;
  personId?: string;
  workerId?: string;
}

export interface SentRecord {
  actionId: string;
  sentence: string;
  who: string;
  followUpAt: string | null;
  attachedFilename?: string | null;
}

type Mailbox = { id: string; emailAddress: string; displayName?: string | null };

const TONE = {
  dark: {
    button:
      "inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-[13px] font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-40",
    box: "rounded-xl border border-emerald-400/30 bg-emerald-400/[0.06] p-4",
    label: "font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300",
    line: "text-[13px] text-slate-200",
    muted: "text-slate-500",
    input:
      "mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[13px] text-slate-100 placeholder-slate-600 focus:border-white/25 focus:outline-none",
    pre: "mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-[12.5px] leading-relaxed text-slate-200",
    confirm:
      "inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-[13px] font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-40",
    cancel: "rounded-lg px-2.5 py-2 text-[13px] text-slate-400 transition hover:text-slate-200",
    error: "mt-2 text-[13px] text-rose-400",
    note: "mt-2 text-[11.5px] leading-snug text-slate-500",
    check: "mt-3 flex items-start gap-2 text-[13px] text-slate-200",
    select:
      "rounded-lg border border-white/15 bg-black/30 px-2 py-1 font-mono text-[12.5px] text-slate-100 focus:border-white/30 focus:outline-none",
  },
  light: {
    button:
      "inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40",
    box: "rounded-xl border border-emerald-200 bg-emerald-50/60 p-4",
    label: "font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700",
    line: "text-[13px] text-slate-800",
    muted: "text-slate-500",
    input:
      "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 placeholder-slate-400 focus:border-slate-400 focus:outline-none",
    pre: "mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[12.5px] leading-relaxed text-slate-800",
    confirm:
      "inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40",
    cancel: "rounded-lg px-2.5 py-2 text-[13px] text-slate-500 transition hover:text-slate-800",
    error: "mt-2 text-[12.5px] text-rose-600",
    note: "mt-2 text-[11.5px] leading-snug text-slate-500",
    check: "mt-3 flex items-start gap-2 text-[13px] text-slate-800",
    select:
      "rounded-lg border border-slate-200 bg-white px-2 py-1 font-mono text-[12.5px] text-slate-900 focus:border-slate-400 focus:outline-none",
  },
} as const;

export function SendFromTriangleButton({
  target,
  sender,
  tone = "dark",
  open,
  onOpen,
}: {
  target: SendTarget;
  /** The person's own mailbox with sending on, or null: then nothing renders. */
  sender: { id: string; emailAddress: string } | null;
  tone?: keyof typeof TONE;
  open: boolean;
  onOpen: () => void;
}) {
  if (!sender) return null;
  const t = TONE[tone];
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={open || target.body.trim().length < 2}
      className={t.button}
      title={`Send from ${sender.emailAddress}`}
    >
      <Send className="h-3.5 w-3.5" />
      Send
    </button>
  );
}

export function SendFromTriangleReview({
  target,
  sender,
  senders = [],
  replyFrom = null,
  tone = "dark",
  pack = null,
  onSent,
  onCancel,
}: {
  target: SendTarget;
  sender: { id: string; emailAddress: string };
  /** Every address this person may send from. */
  senders?: Mailbox[];
  /** The mailbox the conversation arrived in, when Triangle knows it. */
  replyFrom?: string | null;
  tone?: keyof typeof TONE;
  /** What Hanna prepared on this case, and whether anybody approved it. */
  pack?: AttachablePack | null;
  onSent: (sent: SentRecord) => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const t = TONE[tone];
  // The address the recruiter wrote to, when it is one this person sends from.
  const decided = senders.find((box) => box.id === replyFrom) ?? null;
  const [mailAccountId, setMailAccountId] = useState(decided?.id ?? sender.id);
  const from: Mailbox =
    senders.find((box) => box.id === mailAccountId) ?? {
      id: sender.id,
      emailAddress: sender.emailAddress,
      displayName: null,
    };
  const [subject, setSubject] = useState(target.subject ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canAttach = Boolean(pack && mayAttachPack(pack.approval));
  // Approving the document on the case was the decision; it goes with the
  // reply unless it is taken off here. Nothing unapproved can be ticked.
  const [attach, setAttach] = useState(canAttach);
  const body = target.body.trim();
  const ready = !busy && subject.trim().length > 0 && body.length >= 2;

  async function send() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: target.to,
          subject: subject.trim(),
          body,
          draft: target.draft ?? undefined,
          leadId: target.leadId,
          contactId: target.contactId || undefined,
          personId: target.personId,
          mailAccountId,
          attachPack: attach && canAttach,
          putForwardAssignmentId: attach && canAttach ? pack?.assignmentId : undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        actionId?: string;
        followUpAt?: string | null;
        from?: string;
        attachedFilename?: string | null;
      };
      if (!res.ok || !data.actionId) {
        setError(data.error ?? "Not sent.");
        return;
      }
      const attached = data.attachedFilename ?? null;
      onSent({
        actionId: data.actionId,
        sentence: attached
          ? `Sent to ${target.who} at ${target.to} from ${data.from ?? from.emailAddress}, with ${attached}.`
          : `Sent to ${target.who} at ${target.to} from ${data.from ?? from.emailAddress}.`,
        who: target.who,
        followUpAt: data.followUpAt ?? null,
        attachedFilename: attached,
      });
      router.refresh();
    } catch {
      setError("Network error. Nothing was recorded as sent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={t.box} role="dialog" aria-label="Review before sending">
      <p className={t.label}>Once more before it goes</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className={`${t.line} ${t.muted}`}>To</dt>
        <dd className={`${t.line} font-mono`}>{target.to}</dd>
        <dt className={`${t.line} ${t.muted}`}>From</dt>
        <dd className={t.line}>
          {!decided && senders.length > 1 ? (
            // Only when Triangle cannot tell which address the conversation
            // is in. Otherwise it is the address they wrote to, said in words.
            <select
              value={mailAccountId}
              onChange={(e) => setMailAccountId(e.target.value)}
              disabled={busy}
              aria-label="Send from"
              className={t.select}
            >
              {senders.map((box) => (
                <option key={box.id} value={box.id}>
                  {box.displayName ? `${box.displayName} <${box.emailAddress}>` : box.emailAddress}
                </option>
              ))}
            </select>
          ) : (
            <>
              <span className="font-mono">{from.emailAddress}</span>
              {decided && <span className={t.muted}> — the address {target.who} wrote to</span>}
            </>
          )}
        </dd>
      </dl>
      <label className="mt-2 block">
        <span className={`${t.line} ${t.muted}`}>Subject</span>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          disabled={busy}
          placeholder="Subject"
          className={t.input}
        />
      </label>
      <pre className={t.pre}>{body}</pre>

      <AttachRow pack={pack} attach={attach} onAttach={setAttach} busy={busy} tone={tone} />

      <p className={t.note}>
        Leaves from {from.emailAddress}, your own mailbox. Triangle records the text as
        sent, the draft as written, and sets the follow-up date. If your mail server
        refuses, nothing is recorded as sent.
      </p>
      {error && <p className={t.error}>{error}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button type="button" disabled={!ready} onClick={() => void send()} className={t.confirm}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          {busy ? "Sending" : "Send now"}
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className={t.cancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * The attachment, and only in the state where attaching is a real option.
 *
 * Every other state says what is missing, rather than offering a tick that
 * the server would refuse. An unapproved profile has no checkbox at all — a
 * disabled one still reads as "almost allowed".
 */
function AttachRow({
  pack,
  attach,
  onAttach,
  busy,
  tone,
}: {
  pack: AttachablePack | null;
  attach: boolean;
  onAttach: (next: boolean) => void;
  busy: boolean;
  tone: keyof typeof TONE;
}) {
  const t = TONE[tone];

  if (!pack) {
    return (
      <p className={t.note}>
        Nothing is attached. When the team prepares a document for this case and you
        approve it on the card, it goes with the reply.
      </p>
    );
  }

  const preview = (
    <a
      href={pack.href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
    >
      <FileText className="h-3 w-3" />
      Open {pack.filename}
    </a>
  );

  if (!mayAttachPack(pack.approval)) {
    return (
      <p className={t.note}>
        {pack.approval === "superseded" ? PACK_SUPERSEDED : PACK_NOT_APPROVED} {preview}
      </p>
    );
  }

  const what =
    pack.intent === "full_cv"
      ? "the full named CV"
      : pack.intent === "short_bio"
        ? "the short bio — initials, one screen, no contact details"
        : "the anonymised bio — initials, no contact details";

  return (
    <>
      <label className={t.check}>
        <input
          type="checkbox"
          checked={attach}
          onChange={(e) => onAttach(e.target.checked)}
          disabled={busy}
          className="mt-1"
        />
        <span>
          With {pack.filename} — {what} for {pack.who}. You approved it on the case; untick
          to send the reply alone.
        </span>
      </label>
      <p className={t.note}>{preview}</p>
    </>
  );
}
