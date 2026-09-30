"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { mailtoHref } from "@/lib/data/contact-channels";
import { EditableWords } from "@/components/modules/editable-words";
import {
  SendFromTriangleButton,
  SendFromTriangleReview,
} from "@/components/modules/send-from-triangle";
import { EmailCardActions } from "@/components/modules/today-email-actions";
import type { CaseLetter } from "@/lib/data/case-page";

// ---------------------------------------------------------------------------
// The existing judgments on a case: edit the draft, Send from Triangle, one
// Ask. No choice of employee, no second send path. With no sending mailbox,
// Open mail is the way out, as on Today.
// ---------------------------------------------------------------------------

export interface CaseMailbox {
  id: string;
  emailAddress: string;
  displayName?: string | null;
}

export function CaseDrafts({
  letters,
  to,
  who,
  leadId,
  sender,
  senders,
  replyFrom,
}: {
  letters: CaseLetter[];
  to: string | null;
  who: string;
  leadId?: string;
  sender: CaseMailbox | null;
  senders: CaseMailbox[];
  replyFrom: string | null;
}) {
  if (letters.length === 0) return null;
  return (
    <div className="space-y-4">
      {letters.map((letter) => (
        <Letter
          key={letter.subject}
          letter={letter}
          to={to}
          who={who}
          leadId={leadId}
          sender={sender}
          senders={senders}
          replyFrom={replyFrom}
        />
      ))}
    </div>
  );
}

function Letter({
  letter,
  to,
  who,
  leadId,
  sender,
  senders,
  replyFrom,
}: {
  letter: CaseLetter;
  to: string | null;
  who: string;
  leadId?: string;
  sender: CaseMailbox | null;
  senders: CaseMailbox[];
  replyFrom: string | null;
}) {
  const [words, setWords] = useState(letter.body);
  const [reviewing, setReviewing] = useState(false);
  const target = {
    to: to ?? "",
    subject: letter.subject,
    body: words,
    draft: letter.original,
    who,
    leadId,
  };
  const canSend = Boolean(sender && to && words.trim().length >= 2);

  return (
    <article className="space-y-3 rounded-2xl border border-slate-200 bg-white px-4 py-4">
      <h3 className="text-[14px] font-semibold text-slate-950">{letter.subject}</h3>
      <EditableWords
        value={words}
        original={letter.original}
        onChange={setWords}
        tone="light"
        label="The reply to send"
      />
      {to ? (
        <div className="flex flex-wrap items-center gap-3">
          <SendFromTriangleButton
            target={target}
            sender={canSend ? sender : null}
            tone="light"
            open={reviewing}
            onOpen={() => setReviewing(true)}
          />
          <a
            href={mailtoHref(to, letter.subject, words)}
            className={
              canSend
                ? "text-[12.5px] font-medium text-slate-500 underline-offset-2 hover:underline"
                : "inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-1.5 text-[12.5px] font-semibold text-white"
            }
          >
            {!canSend && <Mail className="h-3.5 w-3.5" />}
            {canSend ? "or open in your mail" : "Open mail"}
          </a>
        </div>
      ) : (
        <p className="text-[13px] text-slate-600">No address on the case, so this cannot be sent yet.</p>
      )}
      {reviewing && sender && to ? (
        <SendFromTriangleReview
          target={target}
          sender={sender}
          senders={senders}
          replyFrom={replyFrom}
          tone="light"
          onCancel={() => setReviewing(false)}
          onSent={() => setReviewing(false)}
        />
      ) : null}
    </article>
  );
}

/** One Ask. Triangle decides who takes the words. */
export function CaseAsk({
  who,
  about,
  leadId,
  missionId,
  email,
}: {
  who: string;
  about: string | null;
  leadId?: string;
  missionId: string;
  email: string | null;
}) {
  return (
    <section aria-label="Ask" className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
      <EmailCardActions
        tone="light"
        hideNote
        target={{
          who,
          about: about ?? undefined,
          leadId,
          missionId,
          channelKind: "email",
          value: email || "the case",
        }}
        onRecorded={() => {}}
      />
      <p className="mt-2 text-[12px] leading-snug text-slate-500">
        One Ask. The team decides who takes it, and the answer comes back on this case.
      </p>
    </section>
  );
}
