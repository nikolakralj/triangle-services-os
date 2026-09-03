import { z } from "zod";

// ---------------------------------------------------------------------------
// What an employee brings back after being sent to find a way in.
//
// Triangle knew four buyers by name and could reach none of them. The answer
// is not a field on a form for the CEO to fill in — it is a worker who goes
// and looks, and a decision for a human to accept.
//
// The honesty this schema enforces is `scope`. A German Impressum is legally
// required to publish a phone number, but it is the switchboard, not the
// Geschäftsführer's direct line. A record that says "phone: +49…" without
// saying whose phone it is invites the CEO to expect the wrong person to
// answer. So every channel states how close it actually gets you, and a
// switchboard number arrives with the sentence to say when someone picks up.
// ---------------------------------------------------------------------------

export const CHANNEL_KINDS = [
  "email",
  "phone",
  "linkedin",
  "contact_form",
  "postal",
] as const;

/** How close this channel gets you to the actual person. */
export const CHANNEL_SCOPES = [
  "person", // their own address or line
  "department", // the team that owns the work
  "switchboard", // the company's front door
] as const;

export const reachabilityChannelSchema = z.object({
  kind: z.enum(CHANNEL_KINDS),
  value: z.string().max(400),
  scope: z.enum(CHANNEL_SCOPES),
  /** Whose channel this is, when it is not the target person's own. */
  belongsTo: z.string().max(240).nullable(),
  sourceUrl: z.string().max(600),
  /** The line on the page that says so. Not a paraphrase. */
  evidence: z.string().max(900),
  confidence: z.number().int().min(0).max(100),
});

export const reachabilityReportSchema = z.object({
  version: z.literal(1),
  found: z.boolean(),
  headline: z.string().max(280),
  channels: z.array(reachabilityChannelSchema).max(8),
  companyWebsite: z.string().max(400).nullable(),
  /** The legal-notice page. In DE/AT this is where published contact lives. */
  impressumUrl: z.string().max(600).nullable(),
  /**
   * What a human should actually say. A switchboard number is useless without
   * the sentence that gets you transferred to the right desk — and in Germany
   * that sentence is in German.
   */
  howToOpen: z.string().max(900),
  /** Honest failure. An absence, sourced, is worth more than an invented address. */
  notFoundReason: z.string().max(600).nullable(),
  sources: z
    .array(z.object({ url: z.string().max(600), note: z.string().max(240) }))
    .max(10),
});

export type ReachabilityReport = z.infer<typeof reachabilityReportSchema>;
export type ReachabilityChannel = z.infer<typeof reachabilityChannelSchema>;

export function serializeReachabilityReport(report: ReachabilityReport): string {
  return JSON.stringify(report);
}

const SCOPE_LABEL: Record<(typeof CHANNEL_SCOPES)[number], string> = {
  person: "their own",
  department: "their department",
  switchboard: "company switchboard",
};

/** One line a manager can read without opening the JSON. */
export function describeChannel(channel: ReachabilityChannel): string {
  const who =
    channel.scope === "person"
      ? "their own"
      : channel.belongsTo
        ? `${SCOPE_LABEL[channel.scope]} — ${channel.belongsTo}`
        : SCOPE_LABEL[channel.scope];
  return `${channel.value} (${who})`;
}
