import "server-only";
import { connect as tlsConnect, type TLSSocket } from "node:tls";
import { resolveMailboxPassword } from "@/lib/job-intake/credentials";

// ---------------------------------------------------------------------------
// Outbound mail over the mailbox a person already connected (DEV-013).
//
// There is no Gmail API send in this repository and no third-party mail
// service. Mailboxes are IMAP plus an app password; the same password is what
// Gmail and Microsoft accept on SMTP with implicit TLS (port 465). That is
// the honest send path until OAuth exists, and it means the message leaves
// from the person's own address, in their own Sent folder's provider — not
// from a Triangle relay.
//
// If the server refuses, Triangle says so and records nothing as sent. A
// send that was not accepted by the server is not a send.
//
// Adapted from the transport first written on branch
// cursor/contextual-work-mail-14fb; the policy around it is new.
// ---------------------------------------------------------------------------

export interface SmtpMailbox {
  email_address: string;
  credential_encrypted?: string | null;
  credential_ref?: string | null;
  smtp_host?: string | null;
}

export function defaultSmtpHost(emailAddress: string): string {
  const domain = emailAddress.split("@")[1]?.toLowerCase() ?? "";
  if (domain === "gmail.com" || domain === "googlemail.com") return "smtp.gmail.com";
  if (
    domain.endsWith("outlook.com") ||
    domain.endsWith("hotmail.com") ||
    domain.endsWith("live.com") ||
    domain.endsWith("office365.com")
  ) {
    return "smtp.office365.com";
  }
  return `mail.${domain}`;
}

export function newRfc822Id(fromEmail: string): string {
  const domain = fromEmail.split("@")[1] || "triangle.local";
  const token = `${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 12)}`;
  return `<${token}@${domain}>`;
}

export interface MailAttachment {
  filename: string;
  contentType: string;
  bytes: Uint8Array | Buffer;
}

export interface OutboundMail {
  from: string;
  fromName?: string | null;
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string | null;
  rfc822Id: string;
  attachments?: MailAttachment[];
}

function headerSafe(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/** RFC 2047 for a non-ASCII subject or display name; plain otherwise. */
function encodeWord(value: string): string {
  const clean = headerSafe(value);
  if (/^[\x20-\x7e]*$/.test(clean)) return clean;
  return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

/** ASCII filename for Content-Disposition. Never a path, never a quote. */
export function safeAttachmentFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "file";
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "attachment.bin";
}

function wrapBase64(bytes: Uint8Array | Buffer): string {
  return Buffer.from(bytes).toString("base64").replace(/(.{76})/g, "$1\r\n").trim();
}

export function buildMime(mail: OutboundMail): string {
  const from = mail.fromName ? `${encodeWord(mail.fromName)} <${mail.from}>` : mail.from;
  const headers = [
    `From: ${from}`,
    `To: ${headerSafe(mail.to)}`,
    `Subject: ${encodeWord(mail.subject)}`,
    `Message-ID: ${mail.rfc822Id}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
  ];
  if (mail.inReplyTo) {
    headers.push(`In-Reply-To: ${headerSafe(mail.inReplyTo)}`, `References: ${headerSafe(mail.inReplyTo)}`);
  }

  const attachments = mail.attachments ?? [];
  const body = mail.body.replace(/\r?\n/g, "\r\n");
  if (attachments.length === 0) {
    headers.push(
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: 8bit",
    );
    return `${headers.join("\r\n")}\r\n\r\n${body}\r\n`;
  }

  const boundary = `triangle-${mail.rfc822Id.replace(/[^A-Za-z0-9]/g, "").slice(0, 24)}`;
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  const parts = [
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
  ];
  for (const file of attachments) {
    const filename = safeAttachmentFilename(file.filename);
    const type = headerSafe(file.contentType) || "application/octet-stream";
    parts.push(
      `--${boundary}`,
      `Content-Type: ${type}; name="${filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${filename}"`,
      "",
      wrapBase64(file.bytes),
    );
  }
  parts.push(`--${boundary}--`, "");
  return `${headers.join("\r\n")}\r\n\r\n${parts.join("\r\n")}`;
}

/** SMTP DATA: a line that starts with a dot is sent as two dots. */
export function dotStuff(mime: string): string {
  return mime.replace(/^\./gm, "..");
}

const ADDRESS = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export function isPlainAddress(value: string): boolean {
  return ADDRESS.test(value.trim());
}

/**
 * Send one message through the mailbox's SMTP server. Resolves with the
 * Message-ID we generated when the server accepted it; otherwise the reason.
 */
export async function sendViaMailbox(
  account: SmtpMailbox,
  mail: Omit<OutboundMail, "from" | "rfc822Id"> & { rfc822Id?: string },
  transport: (params: SmtpParams) => Promise<void> = smtpSend465,
): Promise<{ rfc822Id: string } | { error: string }> {
  if (!isPlainAddress(mail.to)) {
    return { error: `"${mail.to}" is not a plain email address.` };
  }
  let password: string;
  try {
    password = resolveMailboxPassword(account);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Mailbox password missing." };
  }

  const host = account.smtp_host?.trim() || defaultSmtpHost(account.email_address);
  const rfc822Id = mail.rfc822Id ?? newRfc822Id(account.email_address);
  const mime = buildMime({
    from: account.email_address,
    fromName: mail.fromName ?? null,
    to: mail.to.trim(),
    subject: mail.subject,
    body: mail.body,
    inReplyTo: mail.inReplyTo,
    rfc822Id,
    attachments: mail.attachments,
  });

  try {
    await transport({
      host,
      user: account.email_address,
      password,
      from: account.email_address,
      to: mail.to.trim(),
      mime,
    });
    return { rfc822Id };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : `SMTP send through ${host} failed.`,
    };
  }
}

export interface SmtpParams {
  host: string;
  user: string;
  password: string;
  from: string;
  to: string;
  mime: string;
}

async function smtpSend465(params: SmtpParams): Promise<void> {
  const socket = await new Promise<TLSSocket>((resolve, reject) => {
    const s = tlsConnect({ host: params.host, port: 465, servername: params.host }, () =>
      resolve(s),
    );
    s.setTimeout(20_000, () => {
      s.destroy();
      reject(new Error(`${params.host} did not answer within 20 seconds.`));
    });
    s.once("error", (err) => reject(new Error(`Could not reach ${params.host}: ${err.message}`)));
  });

  // Replies can arrive in several chunks and multi-line (250-…); read until
  // a line "NNN " ends the reply.
  const read = () =>
    new Promise<string>((resolve, reject) => {
      let buffer = "";
      const onData = (buf: Buffer) => {
        buffer += buf.toString("utf8");
        if (!/\r?\n$/.test(buffer)) return;
        const last = buffer.split(/\r?\n/).filter(Boolean).at(-1) ?? "";
        if (/^\d{3} /.test(last) || /^\d{3}$/.test(last)) {
          socket.off("data", onData);
          socket.off("error", onErr);
          resolve(buffer);
        }
      };
      const onErr = (err: Error) => {
        socket.off("data", onData);
        reject(err);
      };
      socket.on("data", onData);
      socket.once("error", onErr);
    });

  const expect = async (ok: RegExp, step: string) => {
    const reply = await read();
    if (!ok.test(reply)) {
      socket.destroy();
      throw new Error(`${params.host} refused at ${step}: ${reply.trim().slice(0, 180)}`);
    }
  };
  const write = (line: string) => {
    socket.write(`${line}\r\n`);
  };
  const b64 = (v: string) => Buffer.from(v, "utf8").toString("base64");

  try {
    await expect(/^220/m, "banner");
    write("EHLO triangle-services-os");
    await expect(/^250/m, "EHLO");
    write("AUTH LOGIN");
    await expect(/^334/m, "AUTH");
    write(b64(params.user));
    await expect(/^334/m, "username");
    write(b64(params.password));
    await expect(/^235/m, "password — for Gmail and Microsoft this must be an app password");
    write(`MAIL FROM:<${params.from}>`);
    await expect(/^250/m, "MAIL FROM");
    write(`RCPT TO:<${params.to}>`);
    await expect(/^25[01]/m, "RCPT TO");
    write("DATA");
    await expect(/^354/m, "DATA");
    socket.write(`${dotStuff(params.mime)}\r\n.\r\n`);
    await expect(/^250/m, "message");
    write("QUIT");
  } finally {
    socket.end();
  }
}
