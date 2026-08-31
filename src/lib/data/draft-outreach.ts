import "server-only";
import type { OrganizationOperatingProfile } from "@/lib/data/organization-profile";

// ---------------------------------------------------------------------------
// The first message to a labour buyer.
//
// Everything upstream of this — signal, chain, buyer route, package, approval —
// exists so that a human ends up on a call with someone who buys crews. Until
// now the project page could edit, send-mark and archive an outreach draft but
// had no way to CREATE one: Scout would identify Peter Östlund at JSM as the
// buyer for a 6 km cable route, you would accept him, and then there was
// nothing to write.
//
// This does not send. It produces a draft the human reads, edits and sends
// from their own mail client, then marks sent. That boundary is deliberate and
// is not a limitation to be engineered away.
// ---------------------------------------------------------------------------

export interface OutreachContext {
  organization: OrganizationOperatingProfile;
  buyer: { name: string; company: string; title?: string | null };
  project: {
    name: string;
    country?: string | null;
    city?: string | null;
    clientCompany?: string | null;
    generalContractor?: string | null;
    summary?: string | null;
  };
  /** Why this company is believed to buy labour — quoted evidence if we have it. */
  buyerRationale?: string | null;
  /** The crew package being offered, when one has been accepted. */
  package?: { title: string; summary?: string | null; roles?: string[] } | null;
  channel: "email" | "linkedin";
}

export interface DraftedOutreach {
  subject: string;
  body: string;
}

function offerDescription(profile: OrganizationOperatingProfile): string {
  if (profile.offerMode === "teams") return "supplier teams and subcontracted crews";
  if (profile.offerMode === "individuals") return "individual supplied specialists";
  return "individual specialists or full supplied crews";
}

function buildSystemPrompt(ctx: OutreachContext): string {
  const org = ctx.organization;
  const isLinkedIn = ctx.channel === "linkedin";

  return `You write a first approach from ${org.name} to a company that buys site labour.

The recipient has never heard of ${org.name}. They are busy, technical, and receive a lot of unsolicited supplier mail. Earn thirty seconds, not a meeting on the first line.

Hard rules:
- ${isLinkedIn ? "Maximum 90 words. LinkedIn, so no subject line content in the body and no formatting." : "120–170 words of body. Recruiters and project managers skim."}
- Open with the SPECIFIC project and their SPECIFIC role on it. Show you know which package they control. Never "I hope this email finds you well".
- Say plainly what ${org.name} does, using ONLY the approved profile below. ${org.name} supplies ${offerDescription(org)}.
- Do NOT invent worker names, headcounts, CVs, day rates, availability dates, certifications, or past clients. You do not know the roster. Speak about capability, not inventory.
- No pricing. No commitments on dates. No contractual or legal terms.
- Ask for ONE thing: a short call or a conversation with whoever handles subcontracting for that package. Make it easy to say yes to.
- If the evidence below is thin, be more tentative — "I understand you are handling…" rather than asserting it as fact. Never state something the evidence does not support.
- Use this exact approved sign-off, and add no phone numbers, addresses or links that are not in it:
${org.replySignoff}
- Plain text only. No markdown, no bold, no bullet points.

Reply with JSON only:
{"subject":"...","body":"the full message including greeting and sign-off"}${isLinkedIn ? '\nFor LinkedIn set subject to a short connection-note summary; the body is the message.' : ""}`;
}

function buildUserPrompt(ctx: OutreachContext): string {
  const lines: string[] = [
    `APPROVED COMPANY PROFILE (the only source for what we can claim):\n${ctx.organization.companyProfile}`,
    "",
    `RECIPIENT: ${ctx.buyer.name}${ctx.buyer.title ? `, ${ctx.buyer.title}` : ""} at ${ctx.buyer.company}`,
    "",
    `PROJECT: ${ctx.project.name}`,
  ];

  const detail = [
    ctx.project.city && ctx.project.country
      ? `Location: ${ctx.project.city}, ${ctx.project.country}`
      : ctx.project.country
        ? `Country: ${ctx.project.country}`
        : null,
    ctx.project.clientCompany ? `Owner/client: ${ctx.project.clientCompany}` : null,
    ctx.project.generalContractor ? `Main contractor: ${ctx.project.generalContractor}` : null,
    ctx.project.summary ? `What we know: ${ctx.project.summary}` : null,
  ].filter(Boolean);
  if (detail.length > 0) lines.push(detail.join("\n"));

  if (ctx.buyerRationale) {
    lines.push(
      "",
      `WHY WE BELIEVE THEY BUY LABOUR HERE (do not quote this verbatim, use it to be specific):\n${ctx.buyerRationale}`,
    );
  }

  if (ctx.package) {
    lines.push(
      "",
      `THE PACKAGE WE WOULD OFFER: ${ctx.package.title}`,
      ctx.package.summary ?? "",
      ctx.package.roles && ctx.package.roles.length > 0
        ? `Roles: ${ctx.package.roles.join(", ")}`
        : "",
    );
  } else {
    lines.push(
      "",
      "NO SPECIFIC PACKAGE HAS BEEN AGREED YET. Speak about the kind of scope we cover, and ask what they are resourcing — do not describe a crew as though it is already assembled.",
    );
  }

  lines.push("", `CHANNEL: ${ctx.channel}`);
  return lines.filter((l) => l !== "").join("\n");
}

export async function draftBuyerOutreach(
  ctx: OutreachContext,
): Promise<DraftedOutreach> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // A first approach to a real buyer is the highest-stakes text this system
      // produces, so it does not use the cheap default that the project
      // research panel uses.
      model: process.env.OPENAI_OUTREACH_MODEL ?? "gpt-4.1",
      temperature: 0.6,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt(ctx) },
        { role: "user", content: buildUserPrompt(ctx) },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`OpenAI ${response.status}: ${detail.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = payload.choices?.[0]?.message?.content ?? "";
  if (!raw) throw new Error("The model returned nothing.");

  let parsed: { subject?: unknown; body?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The model did not return usable JSON.");
  }

  const body = String(parsed.body ?? "").trim();
  if (!body) throw new Error("The model returned an empty message.");

  return {
    subject: String(parsed.subject ?? `${ctx.project.name}`).trim().slice(0, 300),
    body,
  };
}
