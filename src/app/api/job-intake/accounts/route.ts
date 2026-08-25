import { NextResponse } from "next/server";
import { requireApiAccess, createServiceSupabaseClient } from "@/lib/supabase/server";
import {
  encryptCredential,
  isEncryptionConfigured,
} from "@/lib/job-intake/credentials";
import { ImapMailSource, defaultImapHost } from "@/lib/job-intake/mail-source";

// ---------------------------------------------------------------------------
// GET    /api/job-intake/accounts   — list connected mailboxes
// POST   /api/job-intake/accounts   — connect / update a mailbox
// DELETE /api/job-intake/accounts   — disconnect one (?id=)
//
// The password is encrypted server-side before it is stored, and is NEVER
// returned by any endpoint here. Clients only ever learn whether a mailbox
// is connected, not what its password is.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 60;

/** Reject after `ms` so a stalled connection can never hang the request. */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Timed out after ${Math.round(ms / 1000)}s.`)),
      ms,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Turn a raw connection error into something the user can act on. The
 * self-signed-certificate case matters most: it means a VPN or antivirus is
 * intercepting the IMAP connection, which no password will fix.
 */
function explainConnectionFailure(err: unknown, host: string): string {
  const e = (err ?? {}) as {
    message?: string;
    authenticationFailed?: boolean;
    responseText?: string;
    serverResponseCode?: string;
  };

  // imapflow reports auth failures with a generic "Command failed" message but
  // carries the server's real words on responseText — use those.
  if (e.authenticationFailed || e.serverResponseCode === "AUTHENTICATIONFAILED") {
    const detail = e.responseText ? ` The server said: "${e.responseText}".` : "";
    return (
      `${host} rejected the sign-in.${detail} ` +
      "For Gmail you must use the 16-character app password, not your normal Google password — " +
      "and check the address is typed exactly right."
    );
  }

  const raw = e.responseText || e.message || "connection failed";
  const lower = raw.toLowerCase();

  if (lower.includes("self-signed") || lower.includes("self signed")) {
    return (
      `The connection to ${host} is being intercepted — it presented an untrusted certificate. ` +
      "This is almost always a VPN or antivirus scanning secure traffic. " +
      "Turn the VPN off (or allow port 993) and try again. Your password is not the problem."
    );
  }
  if (lower.includes("certificate") || lower.includes("altname")) {
    return `The certificate from ${host} could not be verified (${raw}). Check the mail server address, or whether a VPN or antivirus is inspecting traffic.`;
  }
  if (
    lower.includes("invalid credentials") ||
    lower.includes("authenticationfailed") ||
    lower.includes("auth") ||
    lower.includes("login")
  ) {
    return "That mailbox rejected the sign-in. For Gmail you must use a 16-character app password, not your normal Google password.";
  }
  if (lower.includes("timed out") || lower.includes("timeout") || lower.includes("etimedout")) {
    return `No response from ${host} on port 993. Check the mail server address, and whether a firewall or VPN is blocking IMAP.`;
  }
  if (lower.includes("enotfound") || lower.includes("eai_again")) {
    return `Could not find the mail server "${host}". Check the address — for a company mailbox it is often mail.yourdomain.com.`;
  }
  if (lower.includes("econnrefused")) {
    return `${host} refused the connection on port 993. IMAP may be disabled for this mailbox.`;
  }
  return `Could not sign in to that mailbox: ${raw}`;
}

export async function GET(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo) {
    return NextResponse.json({ accounts: [], encryptionConfigured: false });
  }

  const svc = createServiceSupabaseClient();
  if (!svc) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  const { data } = await svc
    .from("mail_accounts")
    .select(
      "id, email_address, display_name, provider, watch_label, status, last_synced_at, last_error, credential_ref, credential_encrypted, credential_set_at, imap_host",
    )
    .eq("org_id", access.organizationId)
    .order("created_at", { ascending: true });

  const accounts = (data ?? []).map((a) => ({
    id: a.id,
    emailAddress: a.email_address,
    displayName: a.display_name,
    watchLabel: a.watch_label,
    imapHost: a.imap_host ?? defaultImapHost(String(a.email_address)),
    status: a.status,
    lastSyncedAt: a.last_synced_at,
    lastError: a.last_error,
    credentialSetAt: a.credential_set_at,
    // Whether a password is available — never the password itself.
    connected: Boolean(
      a.credential_encrypted ||
        (a.credential_ref && process.env[a.credential_ref as string]),
    ),
    usesLegacyEnvVar: Boolean(!a.credential_encrypted && a.credential_ref),
  }));

  return NextResponse.json({
    accounts,
    encryptionConfigured: isEncryptionConfigured(),
  });
}

export async function POST(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo) {
    return NextResponse.json(
      { error: "Mailboxes cannot be connected in demo mode." },
      { status: 403 },
    );
  }
  if (access.role !== "admin" && access.role !== "partner") {
    return NextResponse.json(
      { error: "Only an admin or partner can connect a mailbox." },
      { status: 403 },
    );
  }
  if (!isEncryptionConfigured()) {
    return NextResponse.json(
      {
        error:
          "ENCRYPTION_KEY is not configured on the server, so passwords cannot be stored safely. Add it to .env.local and restart.",
      },
      { status: 503 },
    );
  }

  let body: {
    emailAddress?: string;
    displayName?: string;
    password?: string;
    imapHost?: string;
    imapPort?: number;
    watchLabel?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const emailAddress = String(body.emailAddress ?? "").trim().toLowerCase();
  // Gmail shows app passwords in groups of four; people paste them with spaces.
  const password = String(body.password ?? "").replace(/\s+/g, "");

  if (!emailAddress.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Enter the mailbox password. For Gmail this is the 16-character app password." },
      { status: 400 },
    );
  }

  const host = String(body.imapHost ?? "").trim() || defaultImapHost(emailAddress);
  const port = Number(body.imapPort) > 0 ? Math.floor(Number(body.imapPort)) : 993;
  const watchLabel = String(body.watchLabel ?? "").trim() || null;

  // Prove the credentials work before storing them — a mailbox that silently
  // fails on the next cron run is worse than an error here.
  try {
    const probe = new ImapMailSource({
      emailAddress,
      password,
      host,
      port,
      watchLabel,
    });
    // Belt and braces: imapflow has its own timeouts, but a hard ceiling here
    // guarantees the request always returns rather than appearing to freeze.
    await withTimeout(probe.verifyConnection(), 25000);
  } catch (err) {
    return NextResponse.json(
      { error: explainConnectionFailure(err, host) },
      { status: 400 },
    );
  }

  const svc = createServiceSupabaseClient();
  if (!svc) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  const { data, error } = await svc
    .from("mail_accounts")
    .upsert(
      {
        org_id: access.organizationId,
        email_address: emailAddress,
        display_name: String(body.displayName ?? "").trim() || null,
        provider: "imap",
        credential_encrypted: encryptCredential(password),
        credential_ref: null,
        credential_set_at: new Date().toISOString(),
        credential_set_by: access.userId,
        imap_host: host,
        imap_port: port,
        watch_label: watchLabel,
        owner_user_id: access.userId,
        status: "active",
        last_error: null,
      },
      { onConflict: "org_id,email_address" },
    )
    .select("id, email_address")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Could not save the mailbox." }, { status: 500 });
  }

  return NextResponse.json({
    account: { id: data.id, emailAddress: data.email_address, connected: true },
  });
}

export async function DELETE(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo) {
    return NextResponse.json({ error: "Not available in demo mode." }, { status: 403 });
  }
  if (access.role !== "admin" && access.role !== "partner") {
    return NextResponse.json(
      { error: "Only an admin or partner can disconnect a mailbox." },
      { status: 403 },
    );
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing mailbox id." }, { status: 400 });
  }

  const svc = createServiceSupabaseClient();
  if (!svc) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  const { error } = await svc
    .from("mail_accounts")
    .delete()
    .eq("id", id)
    .eq("org_id", access.organizationId);

  if (error) {
    return NextResponse.json({ error: "Could not disconnect the mailbox." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
