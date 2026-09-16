"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AskTriangle } from "@/components/modules/ask-triangle";
import { LearnRulePrompt } from "@/components/modules/learn-rule-prompt";
import type { ContextualAssignmentView } from "@/lib/data/contextual-work-shared";

interface LeadView {
  id: string;
  agencyName: string | null;
  contactName: string | null;
  contactEmail: string | null;
  clientCompany: string | null;
  roleTitle: string;
  country: string | null;
  subject: string | null;
  emailBody: string | null;
  status: string;
  replyReceivedAt?: string | null;
}

interface DraftView {
  id: string;
  subject: string;
  body: string;
  status: string;
  aiBody?: string | null;
}

export function OpportunityWorkspace({
  lead,
  drafts,
  assignments,
}: {
  lead: LeadView;
  drafts: DraftView[];
  assignments: ContextualAssignmentView[];
}) {
  const draft = drafts[0] ?? null;
  const [subject, setSubject] = useState(draft?.subject ?? "");
  const [body, setBody] = useState(draft?.body ?? "");
  const [draftId, setDraftId] = useState(draft?.id ?? null);
  const [busy, setBusy] = useState<"draft" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentId, setSentId] = useState<string | null>(draft?.status === "sent" ? draft.id : null);
  const [showLearn, setShowLearn] = useState(false);

  async function generate() {
    setBusy("draft");
    setError(null);
    try {
      const res = await fetch(`/api/job-intake/leads/${lead.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as {
        draft?: DraftView;
        error?: string;
      };
      if (!res.ok || !data.draft) {
        setError(data.error ?? "Could not draft a reply.");
        return;
      }
      setDraftId(data.draft.id);
      setSubject(data.draft.subject);
      setBody(data.draft.body);
    } catch {
      setError("Network error.");
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    if (!draftId) return;
    setBusy("send");
    setError(null);
    try {
      const res = await fetch(`/api/job-intake/leads/${lead.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId, subject, body }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; rfc822Id?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not send.");
        return;
      }
      setSentId(draftId);
      setShowLearn(true);
    } catch {
      setError("Network error.");
    } finally {
      setBusy(null);
    }
  }

  const waiting = Boolean(sentId) && !lead.replyReceivedAt;
  const theyReplied = Boolean(lead.replyReceivedAt);

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Incoming
        </p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">
          {lead.agencyName ?? lead.contactName ?? "Request"}
          {lead.roleTitle ? ` — ${lead.roleTitle}` : ""}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {[lead.contactName, lead.contactEmail, lead.country, lead.clientCompany]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {lead.emailBody ? (
          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">
            {lead.emailBody}
          </pre>
        ) : (
          <p className="mt-3 text-sm text-slate-500">
            {lead.subject ?? "Original message body was not kept."}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Reply
          </p>
          {theyReplied ? (
            <span className="text-xs font-medium text-emerald-700">Reply received</span>
          ) : waiting ? (
            <span className="text-xs font-medium text-slate-500">Waiting for reply</span>
          ) : sentId ? (
            <span className="text-xs font-medium text-emerald-700">Sent from Triangle</span>
          ) : null}
        </div>
        {draftId ? (
          <div className="mt-3 space-y-2">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={Boolean(sentId)}
              className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm font-medium text-slate-900 disabled:bg-slate-50"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={Boolean(sentId)}
              rows={10}
              className="w-full resize-y rounded-md border border-slate-200 px-2.5 py-2 text-sm leading-relaxed text-slate-800 disabled:bg-slate-50"
            />
            {!sentId && (
              <Button
                variant="primary"
                className="h-8 px-3 text-xs"
                disabled={busy !== null || !body.trim()}
                onClick={() => void send()}
              >
                {busy === "send" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                Send
              </Button>
            )}
          </div>
        ) : (
          <Button
            variant="secondary"
            className="mt-3 h-8 px-3 text-xs"
            disabled={busy !== null}
            onClick={() => void generate()}
          >
            {busy === "draft" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Draft reply
          </Button>
        )}
        {showLearn && (
          <div className="mt-3">
            <LearnRulePrompt
              targetRole="inbox_coordinator"
              targetEmployeeName="Bob"
              diffSummary="sent recruiter reply"
              onDismiss={() => setShowLearn(false)}
            />
          </div>
        )}
        {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
      </section>

      <AskTriangle contextType="job_lead" contextId={lead.id} />

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Agent work
        </p>
        {assignments.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            Nothing assigned on this item yet. Ask Triangle above.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {assignments.map((a) => (
              <li key={a.id} className="rounded-lg border border-slate-100 p-3">
                <p className="text-sm font-semibold text-slate-900">
                  {a.employeeName} — {a.title}
                </p>
                <p className="text-[11px] uppercase tracking-wider text-slate-400">
                  {a.status}
                </p>
                {a.brief && (
                  <dl className="mt-2 space-y-1 text-sm text-slate-700">
                    {a.brief.whatChanged && (
                      <div>
                        <dt className="text-[11px] font-semibold text-slate-400">What changed</dt>
                        <dd>{a.brief.whatChanged}</dd>
                      </div>
                    )}
                    {a.brief.whyItMatters && (
                      <div>
                        <dt className="text-[11px] font-semibold text-slate-400">Why it matters</dt>
                        <dd>{a.brief.whyItMatters}</dd>
                      </div>
                    )}
                    {a.brief.recommend && (
                      <div>
                        <dt className="text-[11px] font-semibold text-slate-400">Recommend</dt>
                        <dd>{a.brief.recommend}</dd>
                      </div>
                    )}
                    {a.brief.needFromYou && (
                      <div>
                        <dt className="text-[11px] font-semibold text-slate-400">Need from you</dt>
                        <dd>{a.brief.needFromYou}</dd>
                      </div>
                    )}
                    {a.brief.evidence && (
                      <div>
                        <dt className="text-[11px] font-semibold text-slate-400">Evidence</dt>
                        <dd className="whitespace-pre-wrap">{a.brief.evidence}</dd>
                      </div>
                    )}
                  </dl>
                )}
                {a.suggestMission && (
                  <PromoteMission title={a.suggestMission} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PromoteMission({ title }: { title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: title }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        missionId?: string;
      };
      if (!res.ok || !data.missionId) {
        setError(data.error ?? "Could not create a mission.");
        return;
      }
      router.push(`/missions/${data.missionId}`);
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2.5">
      <p className="text-xs text-amber-900">
        Larger than this request. Suggested mission: {title}
      </p>
      <div className="mt-2 flex gap-2">
        <Button
          variant="primary"
          className="h-7 px-2.5 text-xs"
          disabled={busy}
          onClick={() => void create()}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          Create Mission
        </Button>
        <span className="self-center text-[11px] text-amber-800">Keep as this opportunity</span>
      </div>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}

export function OpenOriginalLink({
  mailbox,
  subject,
}: {
  mailbox: string | null;
  subject: string | null;
}) {
  if (!mailbox || !subject) return null;
  const address = mailbox.toLowerCase();
  const q = encodeURIComponent(`subject:${subject}`);
  const href = address.includes("gmail") || address.includes("googlemail")
    ? `https://mail.google.com/mail/u/0/#search/${q}`
    : address.includes("outlook") || address.includes("hotmail") || address.includes("live.com")
      ? `https://outlook.office.com/mail/0/search?q=${q}`
      : null;
  if (!href) return null;
  const label =
    address.includes("outlook") || address.includes("hotmail") || address.includes("live.com")
      ? "Open original in Outlook"
      : "Open original in Gmail";
  return (
    <Link href={href} target="_blank" className="text-xs text-slate-500 hover:text-slate-800">
      {label}
    </Link>
  );
}
