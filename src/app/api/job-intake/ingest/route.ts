import { NextResponse } from "next/server";
import { requireApiAccess, createServiceSupabaseClient } from "@/lib/supabase/server";
import { classifyAndExtract, shouldKeepBody } from "@/lib/job-intake/extract";
import { isObviousNoiseHeader } from "@/lib/job-intake/clean-email";
import { verifyMachineToken, hasScope } from "@/lib/auth/machine";
import {
  recordInboundEmail,
  createJobLead,
  getIntakeRules,
} from "@/lib/data/job-intake";
import { logAgentRun } from "@/lib/data/agents";

// ---------------------------------------------------------------------------
// POST /api/job-intake/ingest
//
// The source-agnostic front door. An external agent (a Grok/Claude bot with
// verified Gmail OAuth, Zapier, an Airtable automation) posts RAW messages
// here and this route runs the same pipeline the IMAP sync runs:
// classify → score with the org's house rules → dedupe → store.
//
// Deliberate design: callers send raw material, NOT conclusions. If each bot
// did its own extraction, scores would drift between sources and the house
// rules in Settings would do nothing. One pipe, one set of rules, one set of
// numbers — regardless of who fed it.
//
// Auth: Bearer MCP_API_KEY (see requireApiAccess), or a signed-in session.
//
// Two people running two separate personal bots therefore end up with ONE
// shared, attributed pipeline: `mailbox` records whose inbox a lead came from.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 300;

/** Cap per request so a runaway bot can't spend unbounded LLM budget. */
const MAX_MESSAGES = 50;

interface IncomingMessage {
  messageId?: string;
  threadId?: string;
  from?: string;
  fromName?: string;
  to?: string;
  subject?: string;
  sentAt?: string;
  body?: string;
  bodyIsHtml?: boolean;
}

/**
 * Find or create the mail_accounts row representing an external source, so
 * leads stay attributed to a mailbox even though we hold no credentials.
 */
async function resolveExternalAccount(
  orgId: string,
  mailbox: string | null,
): Promise<string | null> {
  if (!mailbox) return null;
  const svc = createServiceSupabaseClient();
  if (!svc) return null;

  const address = mailbox.trim().toLowerCase();

  const { data: existing } = await svc
    .from("mail_accounts")
    .select("id")
    .eq("org_id", orgId)
    .eq("email_address", address)
    .maybeSingle();

  if (existing) return existing.id as string;

  const { data: created } = await svc
    .from("mail_accounts")
    .insert({
      org_id: orgId,
      email_address: address,
      display_name: null,
      provider: "external",
      status: "active",
      last_synced_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  return (created?.id as string) ?? null;
}

const REQUIRED_SCOPE = "job_intake.ingest";

export async function POST(request: Request) {
  // Preferred: a scoped machine credential (tri_mc_…). A bot's token can do
  // this one job and nothing else — blast-radius containment. Falls back to
  // a signed-in session or the legacy admin key for humans and dev use.
  let organizationId: string;

  const machine = await verifyMachineToken(request);
  if (machine) {
    if (!hasScope(machine, REQUIRED_SCOPE)) {
      return NextResponse.json(
        { error: `Credential "${machine.name}" lacks the ${REQUIRED_SCOPE} scope.` },
        { status: 403 },
      );
    }
    organizationId = machine.orgId;
  } else {
    const access = await requireApiAccess(request);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    if (access.demo) {
      return NextResponse.json(
        { error: "Ingest is not available in demo mode." },
        { status: 403 },
      );
    }
    organizationId = access.organizationId;
  }

  let payload: { mailbox?: string; messages?: IncomingMessage[] };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  if (messages.length === 0) {
    return NextResponse.json(
      {
        error:
          'Send { "mailbox": "you@example.com", "messages": [{ "messageId", "from", "subject", "body" }] }.',
      },
      { status: 400 },
    );
  }
  if (messages.length > MAX_MESSAGES) {
    return NextResponse.json(
      { error: `Send at most ${MAX_MESSAGES} messages per request.` },
      { status: 400 },
    );
  }

  const mailbox = payload.mailbox?.trim().toLowerCase() || null;
  const mailAccountId = await resolveExternalAccount(organizationId, mailbox);
  // Loaded once, not per message.
  const houseRules = (await getIntakeRules(organizationId))?.body ?? null;

  const result = {
    received: messages.length,
    stored: 0,
    alreadySeen: 0,
    opportunities: 0,
    leadsCreated: 0,
    noiseDiscarded: 0,
    skipped: [] as Array<{ index: number; reason: string }>,
    errors: [] as string[],
  };

  for (const [index, msg] of messages.entries()) {
    // A stable id is what makes re-posting the same message harmless.
    const messageId = String(msg.messageId ?? "").trim();
    const body = String(msg.body ?? "");
    const subject = String(msg.subject ?? "").trim() || "(no subject)";

    if (!messageId) {
      result.skipped.push({ index, reason: "missing messageId" });
      continue;
    }
    if (!body.trim()) {
      result.skipped.push({ index, reason: "empty body" });
      continue;
    }

    // Bots are deliberately dumb — they forward everything and make no
    // classification decisions (see JOB_INTAKE.md). So the cheap envelope
    // filter runs HERE, before the LLM call, same as the IMAP path. Matches
    // are dropped without a stored row, exactly like IMAP skips them.
    if (isObviousNoiseHeader(msg.from ?? null, subject)) {
      result.noiseDiscarded += 1;
      result.skipped.push({ index, reason: "noise sender/subject" });
      continue;
    }

    try {
      const extraction = await classifyAndExtract({
        subject,
        senderName: msg.fromName ?? null,
        senderEmail: msg.from ?? null,
        body,
        // Callers usually forward HTML; plain text is fine too.
        bodyIsHtml: msg.bodyIsHtml ?? /<[a-z][\s\S]*>/i.test(body),
        houseRules,
      });

      const keepBody = shouldKeepBody(extraction.classification);
      if (!keepBody) result.noiseDiscarded += 1;

      const stored = await recordInboundEmail({
        orgId: organizationId,
        mailAccountId,
        providerMessageId: messageId,
        providerThreadId: msg.threadId ?? null,
        senderEmail: msg.from ?? null,
        senderName: msg.fromName ?? null,
        recipientEmail: msg.to ?? mailbox,
        subject,
        sentAt: msg.sentAt ?? null,
        classification: extraction.classification,
        confidence: extraction.confidence,
        reason: extraction.reason,
        // Same privacy rule as IMAP: only real opportunities keep their text.
        bodyText: keepBody ? extraction.cleanedText || null : null,
      });

      if (!stored) {
        result.errors.push(`Could not store "${subject}".`);
        continue;
      }
      if (stored.alreadyExisted) {
        result.alreadySeen += 1;
        continue;
      }
      result.stored += 1;

      if (extraction.classification === "job_opportunity" && extraction.lead) {
        result.opportunities += 1;
        const leadId = await createJobLead({
          orgId: organizationId,
          inboundEmailId: stored.id,
          contactEmail: msg.from ?? null,
          lead: extraction.lead,
        });
        if (leadId) result.leadsCreated += 1;
      }
    } catch (err) {
      result.errors.push(
        `${subject}: ${err instanceof Error ? err.message : "extraction failed"}`,
      );
    }
  }

  // Every run leaves a row in the activity feed, whoever fed it.
  await logAgentRun({
    orgId: organizationId,
    agentName: machine?.name ?? "dashboard-session",
    source: "ingest",
    summary: {
      mailbox,
      received: result.received,
      stored: result.stored,
      alreadySeen: result.alreadySeen,
      opportunities: result.opportunities,
      leadsCreated: result.leadsCreated,
      noiseDiscarded: result.noiseDiscarded,
      errors: result.errors.length,
    },
  });

  return NextResponse.json(result);
}
