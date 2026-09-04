"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  Link2,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Quote,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  contactChannels,
  telHref,
  type ContactChannel,
} from "@/lib/data/contact-channels";

// ---------------------------------------------------------------------------
// The people who can actually buy.
//
// These records existed and were never shown. Peter Östlund — named
// Geschäftsführer of the company buying the labour on a 110 kV cable route —
// sat in the database populating a dropdown, and there was no screen on which
// you could see him, notice he had no address, or add one after finding it.
//
// Reachability is the headline here rather than a detail, because it is the
// single thing standing between research and a conversation.
// ---------------------------------------------------------------------------

/**
 * Where a contact came from. Shaped here rather than imported so this client
 * component never pulls in a server-only module — the case loader's own type
 * lives behind `import "server-only"`.
 */
export interface ContactProvenance {
  id: string;
  sourceUrl: string | null;
  evidenceText: string | null;
  confidence: number | null;
  foundByName: string | null;
  foundByEmoji: string | null;
}

export interface BuyerContactRow {
  id: string;
  fullName: string;
  jobTitle: string | null;
  companyName: string | null;
  email: string | null;
  linkedinUrl: string | null;
  buyerRole: string | null;
  notes: string | null;
  /**
   * The case behind this person. Before this existed, a name could be edited
   * or deleted with no way to see who put it there or on what evidence —
   * exactly how Östlund's sourced note got overwritten once already.
   */
  provenance: ContactProvenance[];
}

/**
 * One thing that was tried on this person, and what came of it.
 *
 * Shaped here rather than imported for the same reason as ContactProvenance —
 * the loader it comes from is server-only.
 */
export interface ContactAttemptRow {
  id: string;
  verb: string;
  at: string;
  note: string | null;
  outcome: "reached" | "no_answer" | "dead_end" | null;
}

export function BuyerContactsPanel({
  contacts,
  history = {},
}: {
  contacts: BuyerContactRow[];
  /** contactId -> attempts, newest first. */
  history?: Record<string, ContactAttemptRow[]>;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<Record<string, string>>({});

  // The CEO decides who is worth reaching. An employee does the looking.
  // No form, no pasting — one click, and the result comes back as a proposal.
  async function sendScout(id: string) {
    setSending(id);
    setError(null);
    try {
      const res = await fetch(`/api/research/buyer-contacts/${id}/reach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        ok?: boolean;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not queue that.");
        return;
      }
      setSent((prev) => ({ ...prev, [id]: "queued" }));
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setSending(null);
    }
  }

  if (contacts.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        No buyer contact yet. Map the contractor chain, find who controls the
        package, then accept a buyer contact from Approvals.
      </p>
    );
  }

  function startEdit(c: BuyerContactRow) {
    setEditingId(c.id);
    setEmail(c.email ?? "");
    setLinkedin(c.linkedinUrl ?? "");
    setPhone("");
    setError(null);
  }

  async function save(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/research/buyer-contacts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          linkedinUrl: linkedin,
          ...(phone.trim() ? { phone } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not save that.");
        return;
      }
      setEditingId(null);
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  const reachableCount = contacts.filter((c) => contactChannels(c).length > 0).length;

  return (
    <div className="space-y-2">
      {reachableCount < contacts.length && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {contacts.length - reachableCount} of {contacts.length} have no way to
          reach them. Put an employee on it — they go to the company&apos;s site,
          pull the Impressum and any published number, and file what they find
          for you to accept. You do not go looking for it yourself.
        </p>
      )}

      <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {contacts.map((c) => {
          const channels = contactChannels(c);
          const reachable = channels.length > 0;
          const attempts = history[c.id] ?? [];
          const editing = editingId === c.id;

          return (
            <div key={c.id} className="p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-950">{c.fullName}</p>
                  <p className="text-xs text-slate-600">
                    {[c.jobTitle, c.companyName].filter(Boolean).join(" · ")}
                  </p>
                  {c.buyerRole && (
                    <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                      {c.buyerRole}
                    </p>
                  )}
                </div>
                {!editing && (
                  <div className="flex shrink-0 items-center gap-1">
                    {!reachable && (
                      <Button
                        variant="primary"
                        className="h-7 px-2 text-xs"
                        disabled={sending === c.id || Boolean(sent[c.id])}
                        onClick={() => void sendScout(c.id)}
                      >
                        {sending === c.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Search className="h-3 w-3" />
                        )}
                        {sent[c.id] ? "Scout is on it" : "Find how to reach them"}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => startEdit(c)}
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </Button>
                  </div>
                )}
              </div>

              {!editing && (
                <div className="mt-2 space-y-1">
                  {channels.map((ch, i) => (
                    <ChannelRow key={`${ch.kind}-${i}`} channel={ch} />
                  ))}
                  {!reachable && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                      <AlertCircle className="h-3 w-3" />
                      No way to reach them
                    </span>
                  )}
                </div>
              )}

              {!editing && reachable && (
                <AttemptTrail contactId={c.id} channels={channels} attempts={attempts} />
              )}

              {!editing && c.provenance.length > 0 && (
                <div className="mt-2 space-y-1.5 border-l-2 border-slate-200 pl-2.5">
                  {c.provenance.map((p) => (
                    <div key={p.id}>
                      {p.evidenceText && (
                        <p className="flex gap-1 text-[11px] leading-relaxed text-slate-500">
                          <Quote className="mt-0.5 h-2.5 w-2.5 shrink-0" />
                          <span className="line-clamp-3">{p.evidenceText}</span>
                        </p>
                      )}
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-400">
                        {p.foundByName && (
                          <span>
                            {p.foundByEmoji ?? "AI"} Found by {p.foundByName}
                          </span>
                        )}
                        {p.confidence !== null && <span>{p.confidence}% sure</span>}
                        {p.sourceUrl && (
                          <a
                            href={p.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-sky-700 hover:text-sky-900"
                          >
                            Source
                          </a>
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {editing && (
                <div className="mt-2 space-y-2">
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    type="email"
                    className="h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Phone (added to notes)"
                    className="h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                  <input
                    value={linkedin}
                    onChange={(e) => setLinkedin(e.target.value)}
                    placeholder="https://www.linkedin.com/in/…"
                    className="h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="primary"
                      className="h-7 px-2.5 text-xs"
                      disabled={busy}
                      onClick={() => void save(c.id)}
                    >
                      {busy ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                      Save
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      disabled={busy}
                      onClick={() => setEditingId(null)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  {error && (
                    <p className="flex items-start gap-1 text-xs text-rose-600">
                      <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                      {error}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * One published way in, rendered so it can be used rather than read.
 *
 * A number that is not a `tel:` link and a source that is raw text in the
 * middle of a sentence are both a copy-paste job for whoever is holding the
 * phone. The opening sentence Scout writes is the most useful text on the
 * record and had no place on screen at all.
 */
function ChannelRow({ channel }: { channel: ContactChannel }) {
  const [open, setOpen] = useState(false);
  const Icon =
    channel.kind === "phone" ? Phone : channel.kind === "email" ? Mail : Link2;

  const href =
    channel.kind === "phone"
      ? telHref(channel.value)
      : channel.kind === "email"
        ? `mailto:${channel.value}`
        : channel.value;
  const external = channel.kind !== "phone" && channel.kind !== "email";

  return (
    <div className="text-xs">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <a
          href={href}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
          className="inline-flex items-center gap-1 font-medium text-sky-700 hover:text-sky-900"
        >
          <Icon className="h-3 w-3" />
          {channel.kind === "linkedin" ? "LinkedIn" : channel.value}
        </a>
        {channel.whose && channel.whose !== "their own" && (
          <span className="text-slate-500">{channel.whose}</span>
        )}
        {channel.sourceUrl && (
          <a
            href={channel.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
          >
            source
          </a>
        )}
        {channel.howToOpen && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
          >
            {open ? "hide the words" : "what to say"}
          </button>
        )}
      </div>
      {open && channel.howToOpen && (
        <p className="mt-1 whitespace-pre-wrap rounded-md bg-slate-50 px-2.5 py-2 text-xs leading-relaxed text-slate-700">
          {channel.howToOpen}
        </p>
      )}
    </div>
  );
}

/**
 * What has been tried, and one click to add to it.
 *
 * The whole tracking system: "we called that person, it didn't work". No
 * stage, no score, no form. Three buttons and a list, so that after a few
 * weeks it is obvious whether there is a chance here or not.
 */
function AttemptTrail({
  contactId,
  channels,
  attempts,
}: {
  contactId: string;
  channels: ContactChannel[];
  attempts: ContactAttemptRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const primary = channels[0];

  async function log(outcome: "reached" | "no_answer" | "dead_end") {
    if (!primary) return;
    setBusy(outcome);
    setFailed(null);
    try {
      const res = await fetch("/api/outreach/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          channelKind: primary.kind,
          value: primary.value,
          outcome,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setFailed(data.error ?? "Could not record that.");
        return;
      }
      router.refresh();
    } catch {
      setFailed("Network error.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-2 border-t border-slate-100 pt-2">
      {attempts.length === 0 ? (
        <p className="text-[11px] text-slate-400">Never contacted.</p>
      ) : (
        <ul className="space-y-0.5">
          {attempts.slice(0, 4).map((a) => (
            <li key={a.id} className="text-[11px] text-slate-500">
              {a.verb} {new Date(a.at).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
              })}{" "}
              — {a.note ?? "no outcome recorded"}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <span className="text-[11px] text-slate-400">Log a contact:</span>
        {(
          [
            ["reached", "Got through"],
            ["no_answer", "No answer"],
            ["dead_end", "Dead end"],
          ] as const
        ).map(([outcome, label]) => (
          <button
            key={outcome}
            type="button"
            disabled={busy !== null}
            onClick={() => void log(outcome)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {busy === outcome ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            {label}
          </button>
        ))}
      </div>
      {failed && <p className="mt-1 text-[11px] text-rose-600">{failed}</p>}
    </div>
  );
}
