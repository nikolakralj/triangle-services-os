// What the case and the person show. No secrets, no ids in the words.

export interface WhatsAppDraftCard {
  id: string;
  to: string;
  body: string;
  who: string;
  inboundText: string | null;
  windowOpen: boolean;
  /** One file on the reply. A CV only when the owner or the field sender asked for that person's by name. */
  documentName?: string | null;
  /** Why a reply to the owner or the field sender did not go on its own. */
  heldBecause?: string | null;
}

export interface WhatsAppWaiting {
  id: string;
  who: string;
  from: string;
  text: string;
  at: string;
}

/** A reply that has gone. It is on the record so a person can read what was said. */
export interface WhatsAppSentLine {
  id: string;
  to: string;
  /** The employee who wrote it. Null when that is not on file. */
  by: string | null;
  text: string;
  at: string;
  documentName: string | null;
  /** True when no person approved it: a reply to the owner's or the field sender's own message. */
  withoutApproval: boolean;
  /** True when WhatsApp reported that it could not deliver it. */
  failed?: boolean;
}

export interface WhatsAppRecord {
  drafts: WhatsAppDraftCard[];
  waiting: WhatsAppWaiting[];
  sent?: WhatsAppSentLine[];
  /** The one template a person may send outside the 24-hour window. */
  approvedTemplate: string | null;
}

/**
 * An inbound message is answered once a reply names it, or once anything —
 * a draft or a message already sent — was addressed to its sender after it
 * arrived. Otherwise it is still waiting.
 */
export function inboundAnswered(
  inbound: { wamid: string | null; from: string; at: string },
  outbound: readonly { replyTo: string | null; to: string; at: string }[],
): boolean {
  const arrived = new Date(inbound.at).getTime();
  return outbound.some((reply) => {
    if (inbound.wamid && reply.replyTo === inbound.wamid) return true;
    if (reply.to !== inbound.from) return false;
    const written = new Date(reply.at).getTime();
    return Number.isNaN(arrived) || Number.isNaN(written) || written >= arrived;
  });
}
