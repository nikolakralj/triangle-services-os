// Who to write back to on an inbound requisition.
//
// Envelope From is the wrong person when the message was forwarded into the
// company's mailbox: the sender is then someone already inside, and the
// recruiter's address is in a From:/Von:/mailto header in the body. "Open
// mail" used that inner address, not the mailbox that received the forward.

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

/** Mailboxes the company itself holds — never a recruiter. */
const INTERNAL_MAILBOX_DOMAINS = ["triangle-services.com"];

export function normalizeEmail(value: string | null | undefined): string | null {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) return null;
  const match = email.match(EMAIL_RE);
  return match ? match[0].toLowerCase() : null;
}

export function emailDomain(email: string | null | undefined): string | null {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const domain = normalized.split("@")[1] ?? "";
  return domain || null;
}

/**
 * True when this address is the receiving mailbox, or a mailbox on a domain
 * the company itself operates. Those are never the recruiter to reply to.
 */
export function isInternalMailbox(
  email: string | null | undefined,
  receivingMailbox?: string | null,
): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const receiving = normalizeEmail(receivingMailbox);
  if (receiving && normalized === receiving) return true;
  const domain = emailDomain(normalized);
  return Boolean(domain && INTERNAL_MAILBOX_DOMAINS.includes(domain));
}

interface ParsedFrom {
  name: string | null;
  email: string | null;
}

function cleanName(value: string | null): string | null {
  const name = (value ?? "")
    .replace(/^["']+|["']+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name || EMAIL_RE.test(name)) return null;
  return name;
}

/** One From:/Von:/De: value — "Name <a@b>", "Name [mailto:a@b]", or a bare address. */
export function parseFromHeaderValue(raw: string): ParsedFrom {
  const line = raw.replace(/\s+/g, " ").trim();
  if (!line) return { name: null, email: null };

  const angle = line.match(/^(.*?)<\s*([^>]+)\s*>/);
  if (angle) {
    return {
      name: cleanName(angle[1]),
      email: normalizeEmail(angle[2]),
    };
  }

  const mailto = line.match(/^(.*?)\s*\[mailto:\s*([^\]]+)\]/i);
  if (mailto) {
    return {
      name: cleanName(mailto[1]),
      email: normalizeEmail(mailto[2]),
    };
  }

  return {
    name: null,
    email: normalizeEmail(line),
  };
}

/**
 * Recruiter addresses taken from forwarded/original-message headers in the
 * body, in the order they appear. Envelope From is not included.
 */
export function contactsFromForwardedHeaders(text: string): ParsedFrom[] {
  const out: ParsedFrom[] = [];
  const seen = new Set<string>();
  const fromLine = /^(?:from|von|de)\s*:\s*(.+)$/gim;
  for (const match of text.matchAll(fromLine)) {
    const parsed = parseFromHeaderValue(match[1] ?? "");
    if (!parsed.email || seen.has(parsed.email)) continue;
    seen.add(parsed.email);
    out.push(parsed);
  }
  return out;
}

export interface ResolvedRecruiterContact {
  email: string | null;
  name: string | null;
}

/**
 * The person to reply to: extracted recruiter, then a From: in the body,
 * then the envelope sender — never the receiving mailbox or another
 * internal address.
 */
export function resolveRecruiterContact(params: {
  extractedEmail?: string | null;
  extractedName?: string | null;
  senderEmail?: string | null;
  senderName?: string | null;
  recipientEmail?: string | null;
  bodyText?: string | null;
}): ResolvedRecruiterContact {
  const receiving = params.recipientEmail ?? null;
  const forwarded = contactsFromForwardedHeaders(params.bodyText ?? "");
  const usable = (email: string | null | undefined) =>
    Boolean(email && !isInternalMailbox(email, receiving));

  const extractedEmail = normalizeEmail(params.extractedEmail);
  if (usable(extractedEmail)) {
    const matching = forwarded.find((c) => c.email === extractedEmail);
    const name =
      cleanName(params.extractedName ?? "") ??
      matching?.name ??
      (usable(params.senderEmail) ? cleanName(params.senderName ?? "") : null);
    return { email: extractedEmail, name };
  }

  const inner = forwarded.find((c) => usable(c.email));
  if (inner?.email) {
    return {
      email: inner.email,
      name: inner.name ?? cleanName(params.extractedName ?? ""),
    };
  }

  const senderEmail = normalizeEmail(params.senderEmail);
  if (usable(senderEmail)) {
    return {
      email: senderEmail,
      name: cleanName(params.extractedName ?? "") ?? cleanName(params.senderName ?? ""),
    };
  }

  return { email: null, name: cleanName(params.extractedName ?? "") };
}
