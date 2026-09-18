"use client";

import { useMemo, useState } from "react";
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
// The attachment is the part that had to change. Picking somebody here used
// to tick the attach for you, and the tick was the whole gate: the server
// took the boolean, built a profile for whatever worker id arrived, and sent
// it. So a person's profile could leave Triangle without anyone having
// opened it.
//
// Now the tick only exists for a profile a person has already approved on
// this case, it starts off, and the server re-reads the approval anyway.
// With nothing approved, this says what is missing instead of offering a
// checkbox that cannot work.
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

export interface OfferChoice {
  workerId: string;
  name: string;
  role: string | null;
  why?: string;
  caveats?: string[];
}

export interface PoolWorker {
  workerId: string;
  name: string;
  role: string | null;
  status?: string;
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
  candidates?: OfferChoice[];
}

export interface SentRecord {
  actionId: string;
  sentence: string;
  who: string;
  followUpAt: string | null;
  attachedFilename?: string | null;
}

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
      Send from Triangle
    </button>
  );
}

export function SendFromTriangleReview({
  target,
  sender,
  tone = "dark",
  pool = [],
  pack = null,
  onSent,
  onCancel,
  onPickWorker,
}: {
  target: SendTarget;
  sender: { id: string; emailAddress: string };
  tone?: keyof typeof TONE;
  pool?: PoolWorker[];
  /** What Hanna prepared on this case, and whether anybody approved it. */
  pack?: AttachablePack | null;
  onSent: (sent: SentRecord) => void;
  onCancel: () => void;
  onPickWorker?: (workerId: string) => void;
}) {
  const router = useRouter();
  const t = TONE[tone];
  const [subject, setSubject] = useState(target.subject ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workerId, setWorkerId] = useState(target.workerId ?? "");
  // Never pre-ticked. Nothing about a real person goes out because the page
  // decided it for you.
  const [attach, setAttach] = useState(false);
  const [query, setQuery] = useState("");
  const body = target.body.trim();
  const canAttach = Boolean(pack && mayAttachPack(pack.approval));
  const ready = !busy && subject.trim().length > 0 && body.length >= 2;

  const choices = useMemo(() => {
    const seen = new Set<string>();
    const out: OfferChoice[] = [];
    for (const c of target.candidates ?? []) {
      if (seen.has(c.workerId)) continue;
      seen.add(c.workerId);
      out.push(c);
    }
    const q = query.trim().toLowerCase();
    if (q.length >= 2) {
      for (const p of pool) {
        if (seen.has(p.workerId)) continue;
        const hay = `${p.name} ${p.role ?? ""}`.toLowerCase();
        if (!hay.includes(q)) continue;
        seen.add(p.workerId);
        out.push({ workerId: p.workerId, name: p.name, role: p.role });
      }
    }
    return out;
  }, [target.candidates, pool, query]);

  // Picking who the words are about does not decide what is attached. Those
  // were one control until 18 September, which is how a profile could ride
  // out on a message nobody had approved it for.
  function pick(id: string) {
    setWorkerId(id);
    onPickWorker?.(id);
  }

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
          mailAccountId: sender.id,
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
          ? `Sent to ${target.who} at ${target.to} from ${data.from ?? sender.emailAddress}, with ${attached}.`
          : `Sent to ${target.who} at ${target.to} from ${data.from ?? sender.emailAddress}.`,
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
        <dd className={`${t.line} font-mono`}>{sender.emailAddress}</dd>
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

      {/* Who the words name. Changing it rewrites the background line in the
          reply; it does not attach anything. */}
      {(target.candidates?.length || pool.length > 0) && (
        <div className="mt-3">
          <p className={`${t.line} ${t.muted}`}>Who the reply is about</p>
          <div className="mt-1.5 space-y-1">
            {choices.map((c) => (
              <label
                key={c.workerId}
                className="flex cursor-pointer items-start gap-2 rounded-lg px-1 py-1"
              >
                <input
                  type="radio"
                  name="packet-worker"
                  checked={workerId === c.workerId}
                  onChange={() => pick(c.workerId)}
                  disabled={busy}
                  className="mt-1"
                />
                <span className={t.line}>
                  {c.name}
                  {c.role ? <span className={t.muted}> · {c.role}</span> : null}
                </span>
              </label>
            ))}
          </div>
          {pool.length > 0 && (
            <label className="mt-2 block">
              <span className={`${t.line} ${t.muted}`}>
                Someone else in the pool — type two letters
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={busy}
                placeholder="Name or role"
                className={t.input}
              />
            </label>
          )}
        </div>
      )}

      <AttachRow
        pack={pack}
        attach={attach}
        onAttach={setAttach}
        busy={busy}
        tone={tone}
      />

      <p className={t.note}>
        Leaves from your own mailbox. Triangle records the text as sent, the draft as
        written, and sets the follow-up date. If your mail server refuses, nothing is
        recorded as sent.
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
 * Every other state says what is missing and where to go, rather than
 * offering a tick that the server would refuse. An unapproved profile has no
 * checkbox at all — a disabled one still reads as "almost allowed".
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
        Nothing is attached. To put somebody forward, ask Hanna on this case and
        approve what she prepares.
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
          Attach {pack.filename} — {what} for {pack.who}. You approved this on the
          case; it goes only because you tick it.
        </span>
      </label>
      <p className={t.note}>{preview}</p>
    </>
  );
}
