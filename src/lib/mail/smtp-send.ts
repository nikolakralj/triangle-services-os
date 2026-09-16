import "server-only";
import { connect as tlsConnect } from "node:tls";
import { resolveMailboxPassword } from "@/lib/job-intake/credentials";
import type { MailAccountRow } from "@/lib/job-intake/ingest";

// ---------------------------------------------------------------------------
// Provider-aware outbound mail.
//
// There is no Gmail API send in this repository. Mailboxes are IMAP + an app
// password. The same password is what Gmail/Microsoft accept on SMTP, so this
// is the honest send path until OAuth exists.
//
// If SMTP is refused, Triangle must say so — it must not pretend the message
// went out.
// ---------------------------------------------------------------------------

export function defaultSmtpHost(emailAddress: string): string {
  const domain = emailAddress.split("@")[1]?.toLowerCase() ?? "";
  if (domain === "gmail.com" || domain === "googlemail.com") return "smtp.gmail.com";
  if (domain.endsWith("outlook.com") || domain.endsWith("hotmail.com") || domain.endsWith("live.com")) {
    return "smtp.office365.com";
  }
  return `mail.${domain}`;
}

export function newRfc822Id(fromEmail: string): string {
  const domain = fromEmail.split("@")[1] || "triangle.local";
  const token = `${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 12)}`;
  return `<${token}@${domain}>`;
}

export interface OutboundMail {
  from: string;
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string | null;
  rfc822Id: string;
}

function encodeLogin(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function buildMime(mail: OutboundMail): string {
  const headers = [
    `From: ${mail.from}`,
    `To: ${mail.to}`,
    `Subject: ${mail.subject.replace(/\r?\n/g, " ")}`,
    `Message-ID: ${mail.rfc822Id}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
  ];
  if (mail.inReplyTo) headers.push(`In-Reply-To: ${mail.inReplyTo}`, `References: ${mail.inReplyTo}`);
  return `${headers.join("\r\n")}\r\n\r\n${mail.body.replace(/\r?\n/g, "\r\n")}\r\n`;
}

/**
 * Send one message over SMTP AUTH LOGIN on port 465.
 * Returns the provider Message-ID we generated.
 */
export async function sendViaMailbox(
  account: MailAccountRow,
  mail: Omit<OutboundMail, "from" | "rfc822Id"> & { rfc822Id?: string },
): Promise<{ rfc822Id: string } | { error: string }> {
  let password: string;
  try {
    password = resolveMailboxPassword(account);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Mailbox password missing." };
  }

  const host = defaultSmtpHost(account.email_address);
  const rfc822Id = mail.rfc822Id ?? newRfc822Id(account.email_address);
  const mime = buildMime({
    from: account.email_address,
    to: mail.to,
    subject: mail.subject,
    body: mail.body,
    inReplyTo: mail.inReplyTo,
    rfc822Id,
  });

  try {
    await smtpSend465({
      host,
      user: account.email_address,
      password,
      from: account.email_address,
      to: mail.to,
      mime,
    });
    return { rfc822Id };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "SMTP send failed. Triangle did not mark this as sent.",
    };
  }
}

async function smtpSend465(params: {
  host: string;
  user: string;
  password: string;
  from: string;
  to: string;
  mime: string;
}): Promise<void> {
  const socket = await new Promise<import("node:tls").TLSSocket>((resolve, reject) => {
    const s = tlsConnect({ host: params.host, port: 465, servername: params.host }, () =>
      resolve(s),
    );
    s.setTimeout(20_000, () => {
      s.destroy();
      reject(new Error(`SMTP timeout talking to ${params.host}.`));
    });
    s.once("error", reject);
  });

  const read = () =>
    new Promise<string>((resolve, reject) => {
      const onData = (buf: Buffer) => {
        socket.off("error", onErr);
        resolve(buf.toString("utf8"));
      };
      const onErr = (err: Error) => {
        socket.off("data", onData);
        reject(err);
      };
      socket.once("data", onData);
      socket.once("error", onErr);
    });

  const expect = async (ok: RegExp, step: string) => {
    const reply = await read();
    if (!ok.test(reply)) {
      socket.destroy();
      throw new Error(`SMTP ${step} refused: ${reply.trim().slice(0, 180)}`);
    }
  };

  const write = (line: string) => {
    socket.write(`${line}\r\n`);
  };

  await expect(/^220/m, "banner");
  write(`EHLO triangle`);
  await expect(/^250/m, "EHLO");
  write("AUTH LOGIN");
  await expect(/^334/m, "AUTH");
  write(encodeLogin(params.user));
  await expect(/^334/m, "username");
  write(encodeLogin(params.password));
  await expect(/^235/m, "password");
  write(`MAIL FROM:<${params.from}>`);
  await expect(/^250/m, "MAIL FROM");
  write(`RCPT TO:<${params.to}>`);
  await expect(/^250/m, "RCPT TO");
  write("DATA");
  await expect(/^354/m, "DATA");
  socket.write(`${params.mime.replace(/^\./gm, "..")}\r\n.\r\n`);
  await expect(/^250/m, "message");
  write("QUIT");
  socket.end();
}
