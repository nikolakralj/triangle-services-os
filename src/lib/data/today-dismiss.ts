import "server-only";
import { logContactAttempt, postponeFollowUp } from "@/lib/data/contact-log";
import { markNotForUs } from "@/lib/data/missions";
import {
  dismissSentence,
  type EmailDismissReason,
} from "@/lib/data/today-card-actions";

// ---------------------------------------------------------------------------
// Scoped judgment on a Today mail card.
//
// Not a forever blacklist and not silent ML. Each reason maps onto an
// existing defer / not-for-us / ledger path so Today stops asking without
// inventing a new memory of "never contact this human again".
// ---------------------------------------------------------------------------

export interface TodayDismissTarget {
  reason: EmailDismissReason;
  channelKind: string;
  value?: string;
  actionId?: string | null;
  contactId?: string | null;
  leadId?: string | null;
  personId?: string | null;
  missionId?: string | null;
  companyId?: string | null;
  content?: string | null;
  draft?: string | null;
  subject?: string | null;
}

const NOTES: Record<EmailDismissReason, string> = {
  not_now: "Not now. No message sent from Triangle.",
  not_this_opportunity: "Not this opportunity — scoped, not a forever ban.",
  wrong_person: "Wrong person on this card. Not a blacklist.",
  dont_contact: "Don't contact on this opportunity. Not a forever blacklist.",
  recorded_outside: "Recorded outside Triangle — mailbox sync has not confirmed this.",
};

function targetIds(target: TodayDismissTarget): {
  contactId?: string;
  leadId?: string;
  personId?: string;
} {
  return {
    contactId: target.contactId || undefined,
    leadId: target.leadId || undefined,
    personId: target.personId || undefined,
  };
}

export async function dismissTodayCard(params: {
  orgId: string;
  userId: string;
  target: TodayDismissTarget;
}): Promise<
  | { ok: true; actionId: string | null; sentence: string }
  | { ok: false; error: string }
> {
  const { target } = params;
  const ids = targetIds(target);
  if (!ids.contactId && !ids.leadId && !ids.personId && !(target.reason === "not_now" && target.actionId)) {
    return { ok: false, error: "Say which card to dismiss." };
  }

  if (target.reason === "not_now") {
    if (target.actionId) {
      const moved = await postponeFollowUp({
        orgId: params.orgId,
        userId: params.userId,
        actionId: target.actionId,
      });
      if (!moved.ok) return moved;
      return { ok: true, actionId: target.actionId, sentence: dismissSentence("not_now") };
    }
    const deferred = await logContactAttempt({
      orgId: params.orgId,
      userId: params.userId,
      ...ids,
      channelKind: target.channelKind || "email",
      value: target.value || "the address on record",
      outcome: "sent",
      note: NOTES.not_now,
      defer: true,
    });
    if (!deferred.ok) return deferred;
    return { ok: true, actionId: deferred.actionId, sentence: dismissSentence("not_now") };
  }

  if (target.reason === "not_this_opportunity" && target.missionId && target.companyId) {
    const ruled = await markNotForUs({
      orgId: params.orgId,
      userId: params.userId,
      missionId: target.missionId,
      companyId: target.companyId,
      reason: NOTES.not_this_opportunity,
    });
    if ("error" in ruled) {
      // Fall through to a ledger dead_end so the card still leaves Today.
    } else if (ids.contactId || ids.leadId || ids.personId) {
      const logged = await logContactAttempt({
        orgId: params.orgId,
        userId: params.userId,
        ...ids,
        channelKind: target.channelKind || "email",
        value: target.value || "the address on record",
        outcome: "dead_end",
        note: NOTES.not_this_opportunity,
      });
      if (!logged.ok) return logged;
      return {
        ok: true,
        actionId: logged.actionId,
        sentence: dismissSentence("not_this_opportunity"),
      };
    } else {
      return { ok: true, actionId: null, sentence: dismissSentence("not_this_opportunity") };
    }
  }

  if (target.reason === "recorded_outside") {
    const logged = await logContactAttempt({
      orgId: params.orgId,
      userId: params.userId,
      ...ids,
      channelKind: target.channelKind || "email",
      value: target.value || "the address on record",
      outcome: "sent",
      content: target.content,
      draft: target.draft,
      subject: target.subject,
      note: NOTES.recorded_outside,
    });
    if (!logged.ok) return logged;
    return { ok: true, actionId: logged.actionId, sentence: dismissSentence("recorded_outside") };
  }

  const logged = await logContactAttempt({
    orgId: params.orgId,
    userId: params.userId,
    ...ids,
    channelKind: target.channelKind || "email",
    value: target.value || "the address on record",
    outcome: "dead_end",
    note: NOTES[target.reason],
  });
  if (!logged.ok) return logged;
  return { ok: true, actionId: logged.actionId, sentence: dismissSentence(target.reason) };
}
