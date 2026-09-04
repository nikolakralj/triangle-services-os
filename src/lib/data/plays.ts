import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// An employee with an idea.
//
// Asked in a provider chat why Paul Boxer's number could not be found, Scout
// gave the most useful answer it has produced: UK plant managers do not publish
// direct dials, so stop scraping. Then it laid out real routes — call the Port
// Talbot switchboard and ask for him by name; go through ANDRITZ, the named
// EPC, who usually know the client PM; or trial a paid enrichment vendor
// against a fixed list and score the hit rate before buying a year of it.
//
// None of that could enter Triangle. A finding is a claim about a thing that
// exists; an assignment is work already decided on. There was no object for
// "here are three ways forward, here is what each costs, here is the one I
// would pick" — so the best output an employee produces stayed in a chat
// window where nothing could act on it.
//
// A play is that object. The agent proposes routes; a human picks one; the
// pick becomes either the agent's next job or the human's next action. Nobody
// fills in a form.
// ---------------------------------------------------------------------------

/** Who has to carry out an option. Agents never take the human ones. */
export type PlayActor = "agent" | "human";

export interface PlayOption {
  id: string;
  /** What would actually be done, in one line. */
  action: string;
  /** Why it might work, and what it costs. */
  why: string;
  actor: PlayActor;
  /** The agent's own read: "high", "medium", "low", or a plain phrase. */
  odds: string | null;
}

export interface Play {
  findingId: string;
  headline: string;
  situation: string;
  options: PlayOption[];
  /** The option id the agent would choose, if it has a view. */
  recommended: string | null;
  agentName: string | null;
  agentEmoji: string | null;
  createdAt: string;
  sourceUrl: string | null;
}

/**
 * Read the loose shape an agent actually sends.
 *
 * Held deliberately forgiving: an employee that returns a good idea in a
 * slightly wrong shape should not have it thrown away, which is exactly how
 * three real Tata Steel routes were lost to an empty payload.
 */
export function parsePlay(
  findingId: string,
  payload: Record<string, unknown>,
  meta: {
    agentName: string | null;
    agentEmoji: string | null;
    createdAt: string;
    sourceUrl: string | null;
  },
): Play | null {
  const rawOptions = Array.isArray(payload.options) ? payload.options : [];
  const options: PlayOption[] = rawOptions
    .map((o, i) => {
      const opt = (o ?? {}) as Record<string, unknown>;
      const action = String(opt.action ?? opt.title ?? "").trim();
      if (!action) return null;
      const actor: PlayActor =
        String(opt.actor ?? opt.who ?? "").toLowerCase() === "agent"
          ? "agent"
          : "human";
      return {
        id: String(opt.id ?? `opt-${i + 1}`),
        action: action.slice(0, 300),
        why: String(opt.why ?? opt.reason ?? "").slice(0, 600),
        actor,
        odds: opt.odds ? String(opt.odds).slice(0, 40) : null,
      };
    })
    .filter(Boolean) as PlayOption[];

  if (options.length === 0) return null;

  return {
    findingId,
    headline: String(payload.headline ?? payload.title ?? "An idea").slice(0, 240),
    situation: String(payload.situation ?? payload.summary ?? "").slice(0, 1200),
    options,
    recommended: payload.recommended ? String(payload.recommended) : null,
    ...meta,
  };
}

export async function listPlays(orgId: string): Promise<Play[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];

  const { data } = await svc
    .from("agent_findings")
    .select("id, payload, created_at, source_url, agent_instance_id")
    .eq("org_id", orgId)
    .eq("finding_type", "play")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(10);

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const ids = Array.from(
    new Set(rows.map((r) => r.agent_instance_id).filter(Boolean) as string[]),
  );
  const faces = new Map<string, { name: string; emoji: string }>();
  if (ids.length > 0) {
    const { data: agents } = await svc
      .from("agent_instances")
      .select("id, display_name, emoji")
      .in("id", ids);
    for (const a of agents ?? []) {
      faces.set(a.id as string, {
        name: a.display_name as string,
        emoji: (a.emoji as string) || "🤖",
      });
    }
  }

  return rows
    .map((r) => {
      const face = r.agent_instance_id
        ? faces.get(r.agent_instance_id as string)
        : undefined;
      return parsePlay(
        r.id as string,
        (r.payload as Record<string, unknown>) ?? {},
        {
          agentName: face?.name ?? null,
          agentEmoji: face?.emoji ?? null,
          createdAt: r.created_at as string,
          sourceUrl: (r.source_url as string) ?? null,
        },
      );
    })
    .filter(Boolean) as Play[];
}
