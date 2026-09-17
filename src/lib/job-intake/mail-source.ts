import "server-only";
import { ImapFlow, type FetchMessageObject } from "imapflow";
import { isObviousNoiseHeader } from "./clean-email";
import {
  parseMessageIds,
  type ObserveFolder,
  type ObserveMessage,
} from "@/lib/mail/observe-policy";

// ---------------------------------------------------------------------------
// Reading mailboxes.
//
// Deliberately behind an interface: today every account is read over IMAP with
// an app password, because Gmail API scopes are "restricted" and a production
// OAuth app needs an annual third-party security assessment. If the company
// moves to Google Workspace, an "Internal" OAuth app skips that entirely — at
// which point this becomes a second MailSource implementation, not a rewrite.
//
// Secrets are NEVER stored in the database. mail_accounts.credential_ref holds
// the NAME of an environment variable; the app password itself is created by
// the mailbox owner and lives only in the deployment environment.
// ---------------------------------------------------------------------------

export interface FetchedMessage {
  /** Stable per-provider id — the RFC822 Message-ID. */
  providerMessageId: string;
  providerThreadId: string | null;
  senderEmail: string | null;
  senderName: string | null;
  recipientEmail: string | null;
  subject: string;
  sentAt: string | null;
  body: string;
  bodyIsHtml: boolean;
  inReplyTo: string | null;
  referencesHeader: string | null;
}

export interface MailSource {
  fetchSince(since: Date, limit: number): Promise<FetchedMessage[]>;
}

export interface ImapConfig {
  emailAddress: string;
  /**
   * The already-resolved mailbox password. Resolution (decrypt from the
   * database, or read a legacy env var) happens in credentials.ts — this
   * class never touches storage, and the value is never logged.
   */
  password: string;
  host?: string | null;
  port?: number | null;
  /** Only read mail carrying this Gmail label / IMAP folder. */
  watchLabel?: string | null;
}

/**
 * Best-effort IMAP host from the address. Company domains usually answer on
 * mail.<domain> or imap.<domain>; an explicit host always wins.
 */
export function defaultImapHost(emailAddress: string): string {
  const domain = emailAddress.split("@")[1]?.toLowerCase() ?? "";
  if (domain === "gmail.com" || domain === "googlemail.com") return "imap.gmail.com";
  if (domain.endsWith("outlook.com") || domain.endsWith("hotmail.com")) {
    return "outlook.office365.com";
  }
  return `mail.${domain}`;
}

export class ImapMailSource implements MailSource {
  constructor(private readonly config: ImapConfig) {}

  /** Build a client with explicit timeouts — the defaults are minutes long. */
  private newClient(): ImapFlow {
    return new ImapFlow({
      host: this.config.host || defaultImapHost(this.config.emailAddress),
      port: this.config.port || 993,
      secure: true,
      auth: {
        user: this.config.emailAddress,
        pass: this.config.password,
      },
      logger: false,
      // Without these, imapflow waits up to 90s to connect and 5 minutes on a
      // stalled socket, which looks like the app has frozen.
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      // Generous: a large mailbox can take a while to return envelopes, and
      // a premature cut here looks like "sync does nothing".
      socketTimeout: 180000,
    });
  }

  /**
   * Cheap credential check: connect, open the mailbox, disconnect. Used when
   * someone connects a mailbox — far faster than fetching messages.
   */
  async verifyConnection(): Promise<void> {
    const client = this.newClient();
    client.on("error", () => undefined);
    await client.connect();
    try {
      const mailbox = (await this.resolveMailbox(client)) ?? "INBOX";
      const lock = await client.getMailboxLock(mailbox);
      lock.release();
    } finally {
      await client.logout().catch(() => undefined);
    }
  }

  async fetchSince(since: Date, limit = 100): Promise<FetchedMessage[]> {
    const client = this.newClient();
    // imapflow emits socket errors as events. Without a listener Node turns
    // them into an uncaughtException that can take the whole server down.
    client.on("error", () => undefined);

    const out: FetchedMessage[] = [];
    await client.connect();

    try {
      // A Gmail label is exposed over IMAP as a folder. Falling back to INBOX
      // keeps a mistyped label from silently returning nothing.
      const mailbox = (await this.resolveMailbox(client)) ?? "INBOX";
      const lock = await client.getMailboxLock(mailbox);

      try {
        // ── Pass 1: envelopes only ──────────────────────────────────────
        // The FETCH must run to completion before any other command is
        // issued on this connection — downloading a body mid-iteration
        // deadlocks until the socket times out.
        const candidates: Array<{
          uid: number;
          msg: FetchMessageObject;
          part: PickedPart | null;
        }> = [];

        for await (const msg of client.fetch(
          { since },
          {
            uid: true,
            envelope: true,
            bodyStructure: true,
            headers: ["in-reply-to", "references"],
          },
        )) {
          if (!msg.envelope?.messageId) continue;
          // Cheap sender/subject filter: most of a real inbox is newsletters
          // and alerts. Skipping them here avoids a body download AND an
          // LLM call per message, which is where the time and cost go.
          if (isObviousNoise(msg)) continue;
          candidates.push({
            uid: msg.uid,
            msg,
            part: pickBodyPart(msg.bodyStructure),
          });
        }

        // Newest first, so a limited run gets the most recent mail.
        candidates.sort((a, b) => b.uid - a.uid);

        // ── Pass 2: download bodies for survivors only ──────────────────
        for (const c of candidates.slice(0, limit)) {
          const body = c.part
            ? await this.downloadPart(client, c.uid, c.part.path)
            : "";
          out.push(toFetchedMessage(c.msg, body, c.part?.isHtml ?? false));
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => undefined);
    }

    return out;
  }

  /**
   * Envelopes from INBOX and Sent. No bodies, no LLM, no watch-label.
   * Job intake may only read a labelled folder; replies and outgoing mail
   * live on the real INBOX / Sent folders.
   */
  async fetchForObserve(since: Date, limit = 200): Promise<ObserveMessage[]> {
    const client = this.newClient();
    client.on("error", () => undefined);

    const out: ObserveMessage[] = [];
    await client.connect();

    try {
      out.push(...(await this.fetchFolderEnvelopes(client, "INBOX", "inbox", since, limit)));
      try {
        const sentPath = pickSentMailboxPath(await client.list());
        if (sentPath) {
          out.push(
            ...(await this.fetchFolderEnvelopes(client, sentPath, "sent", since, limit)),
          );
        }
      } catch {
        // INBOX observations still count if Sent cannot be opened.
      }
    } finally {
      await client.logout().catch(() => undefined);
    }

    return out;
  }

  private async fetchFolderEnvelopes(
    client: ImapFlow,
    mailbox: string,
    folder: ObserveFolder,
    since: Date,
    limit: number,
  ): Promise<ObserveMessage[]> {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const rows: FetchMessageObject[] = [];
      for await (const msg of client.fetch(
        { since },
        {
          uid: true,
          envelope: true,
          threadId: true,
          headers: ["in-reply-to", "references"],
        },
      )) {
        if (!msg.envelope?.messageId) continue;
        rows.push(msg);
      }
      rows.sort((a, b) => b.uid - a.uid);
      return rows.slice(0, limit).flatMap((msg) => {
        const mapped = toObserveMessage(msg, folder);
        return mapped ? [mapped] : [];
      });
    } finally {
      lock.release();
    }
  }

  private async resolveMailbox(client: ImapFlow): Promise<string | null> {
    const label = this.config.watchLabel?.trim();
    if (!label) return "INBOX";
    try {
      const list = await client.list();
      const hit = list.find(
        (b) =>
          b.path === label ||
          b.name === label ||
          b.path.toLowerCase() === label.toLowerCase(),
      );
      return hit?.path ?? null;
    } catch {
      return null;
    }
  }

  /** imapflow decodes content-transfer-encoding for us. */
  private async downloadPart(
    client: ImapFlow,
    uid: number,
    path: string,
  ): Promise<string> {
    try {
      const { content } = await client.download(String(uid), path, { uid: true });
      const chunks: Buffer[] = [];
      for await (const chunk of content) {
        chunks.push(Buffer.from(chunk));
        // Guard against a pathological attachment-sized "body".
        if (chunks.reduce((n, c) => n + c.length, 0) > 2_000_000) break;
      }
      return Buffer.concat(chunks).toString("utf8");
    } catch {
      return "";
    }
  }
}

// ── message assembly ────────────────────────────────────────────────────────

function toFetchedMessage(
  msg: FetchMessageObject,
  body: string,
  bodyIsHtml: boolean,
): FetchedMessage {
  const env = msg.envelope;
  const from = env?.from?.[0];
  const to = env?.to?.[0];
  return {
    providerMessageId: String(env?.messageId ?? ""),
    providerThreadId: readGmailThreadId(msg),
    senderEmail: from?.address ?? null,
    senderName: from?.name ?? null,
    recipientEmail: to?.address ?? null,
    subject: env?.subject ?? "(no subject)",
    sentAt: env?.date ? new Date(env.date).toISOString() : null,
    body,
    bodyIsHtml,
    inReplyTo: inReplyToOf(msg),
    referencesHeader: headerValue(msg.headers, "references"),
  };
}

function toObserveMessage(
  msg: FetchMessageObject,
  folder: ObserveFolder,
): ObserveMessage | null {
  const env = msg.envelope;
  const messageId = env?.messageId ? String(env.messageId) : "";
  if (!messageId) return null;
  const to = (env?.to ?? [])
    .map((a) => a.address)
    .filter((a): a is string => Boolean(a))
    .join(", ");
  const refs = headerValue(msg.headers, "references");
  return {
    messageId,
    inReplyTo: inReplyToOf(msg),
    references: refs ? parseMessageIds(refs) : [],
    from: env?.from?.[0]?.address ?? "",
    to,
    subject: env?.subject ?? "",
    sentAt: env?.date ? new Date(env.date).toISOString() : null,
    folder,
    threadId: readGmailThreadId(msg),
  };
}

function inReplyToOf(msg: FetchMessageObject): string | null {
  const env = msg.envelope?.inReplyTo ? String(msg.envelope.inReplyTo) : null;
  return env || headerValue(msg.headers, "in-reply-to");
}

/** IMAP header blob → one field, unfolding wrapped lines. */
export function headerValue(headers: Buffer | undefined, name: string): string | null {
  if (!headers) return null;
  const unfolded = headers.toString("utf8").replace(/\r?\n[ \t]+/g, " ");
  const re = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*(.*)$`, "im");
  const m = unfolded.match(re);
  const v = m?.[1]?.trim();
  return v ? v : null;
}

/**
 * Prefer the server's SPECIAL-USE \\Sent flag; fall back to common names
 * (Gmail "[Gmail]/Sent Mail", Outlook "Sent Items").
 */
export function pickSentMailboxPath(
  boxes: Array<{ path: string; name?: string; specialUse?: string | null }>,
): string | null {
  const special = boxes.find((b) => {
    const use = String(b.specialUse ?? "").toLowerCase().replace(/^\\/, "");
    return use === "sent";
  });
  if (special) return special.path;
  const names = new Set([
    "[gmail]/sent mail",
    "sent",
    "sent mail",
    "sent items",
    "inbox.sent",
  ]);
  const hit = boxes.find(
    (b) =>
      names.has(b.path.toLowerCase()) || names.has((b.name ?? "").toLowerCase()),
  );
  return hit?.path ?? null;
}

// Cheap envelope pre-filter — shared with the ingest endpoint; lives in
// clean-email.ts so both intake paths reject the same noise.
function isObviousNoise(msg: FetchMessageObject): boolean {
  return isObviousNoiseHeader(
    msg.envelope?.from?.[0]?.address ?? null,
    msg.envelope?.subject ?? null,
  );
}

// ── body-structure walking ──────────────────────────────────────────────────

interface PickedPart { path: string; isHtml: boolean }

type BodyNode = {
  type?: string;
  part?: string;
  disposition?: string;
  childNodes?: BodyNode[];
};

/**
 * Prefer text/html (agency mail is almost always HTML), fall back to
 * text/plain. Attachments are skipped — we only want the message body.
 */
export function pickBodyPart(structure: unknown): PickedPart | null {
  const root = structure as BodyNode | undefined;
  if (!root) return null;

  // Held in an object so TypeScript doesn't narrow these to `null` across
  // the recursive closure.
  const found: { html?: string; plain?: string } = {};

  const walk = (node: BodyNode) => {
    const type = (node.type ?? "").toLowerCase();
    const isAttachment = (node.disposition ?? "").toLowerCase() === "attachment";

    if (!isAttachment && node.part) {
      if (type === "text/html" && found.html === undefined) found.html = node.part;
      if (type === "text/plain" && found.plain === undefined) found.plain = node.part;
    }
    for (const child of node.childNodes ?? []) walk(child);
  };

  walk(root);

  if (found.html !== undefined) return { path: found.html, isHtml: true };
  if (found.plain !== undefined) return { path: found.plain, isHtml: false };

  // A non-multipart message has no `part` on the root; part "1" is the body.
  const rootType = (root.type ?? "").toLowerCase();
  if (rootType === "text/html") return { path: "1", isHtml: true };
  if (rootType === "text/plain") return { path: "1", isHtml: false };
  return null;
}

/** Gmail exposes a stable thread id when the X-GM-EXT-1 capability is on. */
function readGmailThreadId(msg: FetchMessageObject): string | null {
  if (msg.threadId) return String(msg.threadId);
  const gm = (msg as unknown as { "x-gm-thrid"?: string | number })["x-gm-thrid"];
  return gm !== undefined && gm !== null ? String(gm) : null;
}
