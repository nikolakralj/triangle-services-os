// What the case and the person show. No secrets, no ids in the words.

export interface WhatsAppDraftCard {
  id: string;
  to: string;
  body: string;
  who: string;
  inboundText: string | null;
  windowOpen: boolean;
  /** A contractor, company, or subcontractor list. Never a CV. */
  documentName?: string | null;
}

export interface WhatsAppWaiting {
  id: string;
  who: string;
  from: string;
  text: string;
  at: string;
}

export interface WhatsAppRecord {
  drafts: WhatsAppDraftCard[];
  waiting: WhatsAppWaiting[];
  /** The one template a person may send outside the 24-hour window. */
  approvedTemplate: string | null;
}

/** An inbound is no longer waiting once any outbound — draft or already sent — is addressed to that sender. */
export function whatsAppInboundHasReply(from: string, outboundTo: readonly string[]): boolean {
  return outboundTo.includes(from);
}
