import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Two numbers on the dashboard were the string "0" with helper text asserting
// "No formal RFQ yet" and "Proposal module is ready next". Both were written
// before the tables existed and neither would ever have changed, however much
// work got done — a stat card that cannot move is decoration.
//
// These count real rows. They are still zero today, but they are zero because
// nothing has been sent, not because nobody wired them up.
// ---------------------------------------------------------------------------

export interface CommercialStats {
  /** Requirements a human qualified against the eleven-fact gate. */
  qualifiedRequirements: number;
  /** External actions actually confirmed as done by a named human. */
  outreachSent: number;
  /** Confirmed sends whose follow-up date has passed with no response logged. */
  awaitingReply: number;
}

const EXTERNAL = ["email", "linkedin", "packet", "proposal", "prequalification"];
const CONFIRMED = ["completed", "responded", "no_response"];

export async function getCommercialStats(orgId: string): Promise<CommercialStats> {
  const svc = createServiceSupabaseClient();
  if (!svc) {
    return { qualifiedRequirements: 0, outreachSent: 0, awaitingReply: 0 };
  }

  const head = { count: "exact" as const, head: true };
  const nowIso = new Date().toISOString();

  const [qualified, sent, chasing] = await Promise.all([
    svc
      .from("commercial_requirements")
      .select("id", head)
      .eq("org_id", orgId)
      .in("status", ["qualified", "proposal_ready", "ordered"]),
    svc
      .from("commercial_actions")
      .select("id", head)
      .eq("org_id", orgId)
      .in("status", CONFIRMED)
      .in("action_type", EXTERNAL),
    svc
      .from("commercial_actions")
      .select("id", head)
      .eq("org_id", orgId)
      .eq("status", "completed")
      .in("action_type", EXTERNAL)
      .not("follow_up_at", "is", null)
      .lt("follow_up_at", nowIso),
  ]);

  return {
    qualifiedRequirements: qualified.count ?? 0,
    outreachSent: sent.count ?? 0,
    awaitingReply: chasing.count ?? 0,
  };
}
