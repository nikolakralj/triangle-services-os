// ---------------------------------------------------------------------------
// Reading a way in, out of the notes field.
//
// buyer_contacts has exactly two channel columns — email and linkedin_url —
// and both are reserved for a channel that is genuinely the person's own. A
// published switchboard is not, so accepting one writes a line into `notes`
// instead:
//
//   Phone: +49 175 165 25 84 (switchboard — JSM Utility Services (EU) GmbH,
//   Waltenhofen office) — source: https://jsmgroup.com/contact-us/
//   How to open: Guten Tag, mein Name ist …
//
// That is a deliberate choice — pretending a switchboard is a managing
// director's direct line is how someone dials and asks for the wrong thing.
// But storing it as prose meant every reader re-invented its own regex, and
// the sentence Scout wrote for the call — the single most useful text in the
// database — was rendered nowhere at all.
//
// One parser, so "can we reach this person" has one answer everywhere.
// No `server-only`: the contacts panel is a client component and needs it too.
// ---------------------------------------------------------------------------

export type ChannelKind = "phone" | "email" | "linkedin" | "contact_form" | "other";

export interface ContactChannel {
  kind: ChannelKind;
  /** The number, address or URL as published. */
  value: string;
  /** Whose desk this is — "their own", "switchboard — Port Talbot Works". */
  whose: string;
  /** Where it was published. */
  sourceUrl: string | null;
  /** What to say to get past that desk. Scout writes this; nobody showed it. */
  howToOpen: string | null;
}

export interface ParsedContactNotes {
  channels: ContactChannel[];
  /** Everything that was prose rather than a channel line. */
  prose: string;
}

const KIND_LABEL: Record<string, ChannelKind> = {
  phone: "phone",
  email: "email",
  linkedin: "linkedin",
  contact_form: "contact_form",
};

/**
 * Split the notes blob into channels and leftover prose.
 *
 * A `How to open:` line belongs to the channel line above it, which is how
 * acceptFinding writes it.
 */
export function parseContactNotes(notes: string | null | undefined): ParsedContactNotes {
  const channels: ContactChannel[] = [];
  const prose: string[] = [];

  for (const raw of String(notes ?? "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    const howTo = /^How to open:\s*(.+)$/i.exec(line);
    if (howTo) {
      const last = channels[channels.length - 1];
      if (last && !last.howToOpen) last.howToOpen = howTo[1].trim();
      else prose.push(line);
      continue;
    }

    const match = /^(Phone|Email|LinkedIn|contact_form|linkedin|phone|email):\s*(.+)$/.exec(line);
    if (!match) {
      prose.push(line);
      continue;
    }

    const kind = KIND_LABEL[match[1].toLowerCase()] ?? "other";
    let rest = match[2].trim();

    // "— source: https://…" is appended last, so take it off the end first.
    let sourceUrl: string | null = null;
    const source = /\s+[—-]\s*source:\s*(\S+)\s*$/i.exec(rest);
    if (source) {
      sourceUrl = source[1] === "unknown" ? null : source[1];
      rest = rest.slice(0, source.index).trim();
    }

    // "(switchboard — JSM Utility Services (EU) GmbH)" — the parenthesis is
    // balanced by hand because company names contain their own brackets.
    let whose = "";
    if (rest.endsWith(")")) {
      let depth = 0;
      for (let i = rest.length - 1; i >= 0; i -= 1) {
        if (rest[i] === ")") depth += 1;
        else if (rest[i] === "(") {
          depth -= 1;
          if (depth === 0) {
            whose = rest.slice(i + 1, rest.length - 1).trim();
            rest = rest.slice(0, i).trim();
            break;
          }
        }
      }
    }

    if (!rest) {
      prose.push(line);
      continue;
    }
    channels.push({ kind, value: rest, whose, sourceUrl, howToOpen: null });
  }

  return { channels, prose: prose.join("\n") };
}

export interface ReachableContactLike {
  email?: string | null;
  linkedinUrl?: string | null;
  linkedin_url?: string | null;
  notes?: string | null;
}

/** Every way we currently have of contacting this person, own fields included. */
export function contactChannels(contact: ReachableContactLike): ContactChannel[] {
  const parsed = parseContactNotes(contact.notes);
  const own: ContactChannel[] = [];
  if (contact.email) {
    own.push({
      kind: "email",
      value: contact.email,
      whose: "their own",
      sourceUrl: null,
      howToOpen: null,
    });
  }
  const li = contact.linkedinUrl ?? contact.linkedin_url;
  if (li) {
    own.push({
      kind: "linkedin",
      value: li,
      whose: "their own",
      sourceUrl: null,
      howToOpen: null,
    });
  }
  return [...own, ...parsed.channels];
}

/** True when there is at least one published way to reach them. */
export function isReachable(contact: ReachableContactLike): boolean {
  return contactChannels(contact).length > 0;
}

/**
 * The channel to try first.
 *
 * A phone call ahead of a mailbox on purpose: a switchboard puts a human on
 * the line in a minute, and a cold email to a shared enquiries@ inbox is the
 * slowest thing in commercial life. A channel that carries a written opening
 * sentence outranks one that does not, because it can be acted on without
 * composing anything.
 */
export function bestChannel(contact: ReachableContactLike): ContactChannel | null {
  const order: ChannelKind[] = ["phone", "email", "linkedin", "contact_form", "other"];
  const ranked = contactChannels(contact).slice().sort((a, b) => {
    const byKind = order.indexOf(a.kind) - order.indexOf(b.kind);
    if (byKind !== 0) return byKind;
    return Number(Boolean(b.howToOpen)) - Number(Boolean(a.howToOpen));
  });
  return ranked[0] ?? null;
}

/** `tel:` needs the digits and a leading +, nothing else. */
export function telHref(value: string): string {
  return `tel:${value.replace(/[^\d+]/g, "")}`;
}
