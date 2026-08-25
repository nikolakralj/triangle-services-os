import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { ImapMailSource, type MailSource } from "./mail-source";
import { resolveMailboxPassword } from "./credentials";
import { classifyAndExtract, shouldKeepBody } from "./extract";
import {
  recordInboundEmail,
  createJobLead,
  getIntakeRules,
} from "@/lib/data/job-intake";

// ---------------------------------------------------------------------------
// The ingestion run: fetch → clean → classify → store.
//
// Two rules this enforces, both deliberate:
//   1. Idempotent. Re-running never duplicates, because recordInboundEmail
//      is keyed on (org_id, provider_message_id). Safe to run on a cron.
//   2. Classify before storing. Anything that isn't a real agency opportunity
//      keeps only its verdict — the body is discarded and never written.
// ---------------------------------------------------------------------------

export interface MailAccountRow {
  id: string;
  email_address: string;
  credential_ref: string | null;
  credential_encrypted: string | null;
  imap_host: string | null;
  imap_port: number | null;
  provider: string;
  watch_label: string | null;
  status: string;
  last_synced_at: string | null;
}

export interface IngestSummary {
  account: string;
  fetched: number;
  alreadySeen: number;
  opportunities: number;
  noiseDiscarded: number;
  leadsCreated: number;
  errors: string[];
}

/**
 * How far back to look on the very first sync. Kept modest on purpose: a
 * month of a busy inbox is hundreds of messages, and every one that gets past
 * the noise filter costs an LLM call. Run sync again to walk further back.
 */
const FIRST_RUN_DAYS = 14;
/** Overlap window so a message arriving mid-run isn't missed. */
const OVERLAP_MINUTES = 10;

export async function listActiveMailAccounts(orgId: string): Promise<MailAccountRow[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];
  const { data } = await svc
    .from("mail_accounts")
    .select(
      "id, email_address, credential_ref, credential_encrypted, imap_host, imap_port, provider, watch_label, status, last_synced_at",
    )
    .eq("org_id", orgId)
    .eq("status", "active");
  return (data as MailAccountRow[]) ?? [];
}

function buildSource(account: MailAccountRow): MailSource {
  if (account.provider !== "imap") {
    throw new Error(
      `Provider "${account.provider}" is not implemented yet. Use imap.`,
    );
  }
  // Throws with an actionable message if no password is stored.
  const password = resolveMailboxPassword(account);

  return new ImapMailSource({
    emailAddress: account.email_address,
    password,
    host: account.imap_host,
    port: account.imap_port,
    watchLabel: account.watch_label,
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How far back to read.
 *
 * `sinceDays` is an explicit backfill: it ignores the watermark entirely so
 * the user can pull in older mail on demand. Already-seen messages are
 * skipped cheaply by provider_message_id, so re-reading a window is safe.
 */
function sinceFor(account: MailAccountRow, sinceDays?: number): Date {
  if (sinceDays && sinceDays > 0) {
    return new Date(Date.now() - sinceDays * DAY_MS);
  }
  if (!account.last_synced_at) {
    return new Date(Date.now() - FIRST_RUN_DAYS * DAY_MS);
  }
  return new Date(
    new Date(account.last_synced_at).getTime() - OVERLAP_MINUTES * 60 * 1000,
  );
}

/**
 * Record the outcome of a run.
 *
 * On failure we deliberately do NOT advance last_synced_at — otherwise the
 * next run would start after mail we never actually read, silently skipping
 * it forever. We also leave the account 'active', because listActiveMailAccounts
 * filters on that: flipping it to 'error' would quietly drop the mailbox out
 * of every future sync after a single hiccup.
 */
async function markSynced(accountId: string, error?: string): Promise<void> {
  const svc = createServiceSupabaseClient();
  if (!svc) return;

  const patch: Record<string, unknown> = { last_error: error ?? null };
  if (!error) patch.last_synced_at = new Date().toISOString();

  await svc.from("mail_accounts").update(patch).eq("id", accountId);
}

/** Ingest one mailbox. Never throws — failures are reported in the summary. */
export async function ingestAccount(
  account: MailAccountRow,
  orgId: string,
  opts: { limit?: number; sinceDays?: number } = {},
): Promise<IngestSummary> {
  const summary: IngestSummary = {
    account: account.email_address,
    fetched: 0,
    alreadySeen: 0,
    opportunities: 0,
    noiseDiscarded: 0,
    leadsCreated: 0,
    errors: [],
  };

  let messages;
  try {
    const source = buildSource(account);
    messages = await source.fetchSince(
      sinceFor(account, opts.sinceDays),
      opts.limit ?? 60,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Mailbox fetch failed.";
    summary.errors.push(message);
    await markSynced(account.id, message);
    return summary;
  }

  summary.fetched = messages.length;

  // Loaded once per run, not per message.
  const houseRules = (await getIntakeRules(orgId))?.body ?? null;

  for (const msg of messages) {
    try {
      const result = await classifyAndExtract({
        subject: msg.subject,
        senderName: msg.senderName,
        senderEmail: msg.senderEmail,
        body: msg.body,
        bodyIsHtml: msg.bodyIsHtml,
        houseRules,
      });

      const keepBody = shouldKeepBody(result.classification);
      if (!keepBody) summary.noiseDiscarded += 1;

      const stored = await recordInboundEmail({
        orgId,
        mailAccountId: account.id,
        providerMessageId: msg.providerMessageId,
        providerThreadId: msg.providerThreadId,
        senderEmail: msg.senderEmail,
        senderName: msg.senderName,
        recipientEmail: msg.recipientEmail,
        subject: msg.subject,
        sentAt: msg.sentAt,
        classification: result.classification,
        confidence: result.confidence,
        reason: result.reason,
        // The privacy rule, enforced here: only a real opportunity keeps its
        // text, and only the cleaned version — never the raw source.
        bodyText: keepBody ? result.cleanedText || null : null,
      });

      if (!stored) {
        summary.errors.push(`Could not store "${msg.subject}".`);
        continue;
      }
      if (stored.alreadyExisted) {
        summary.alreadySeen += 1;
        continue;
      }

      if (result.classification === "job_opportunity" && result.lead) {
        summary.opportunities += 1;
        const leadId = await createJobLead({
          orgId,
          inboundEmailId: stored.id,
          contactEmail: msg.senderEmail,
          lead: result.lead,
        });
        if (leadId) summary.leadsCreated += 1;
      }
    } catch (err) {
      summary.errors.push(
        `${msg.subject}: ${err instanceof Error ? err.message : "extraction failed"}`,
      );
    }
  }

  await markSynced(account.id);
  return summary;
}

/** Ingest every active mailbox for an org. */
export async function ingestAllAccounts(
  orgId: string,
  opts: { limit?: number; sinceDays?: number } = {},
): Promise<IngestSummary[]> {
  const accounts = await listActiveMailAccounts(orgId);
  const summaries: IngestSummary[] = [];
  // Sequential on purpose: keeps IMAP connections and OpenAI spend predictable.
  for (const account of accounts) {
    summaries.push(await ingestAccount(account, orgId, opts));
  }
  return summaries;
}
