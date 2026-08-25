import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

export type SendChannel = "email" | "linkedin" | "whatsapp" | "other";
export type SendStatus =
  | "sent"
  | "replied_interested"
  | "replied_not_interested"
  | "negotiating"
  | "placed"
  | "ghosted";

export type PacketSend = {
  id: string;
  packageId: string;
  contactId: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactCompany: string | null;
  sentAt: string;
  channel: SendChannel;
  status: SendStatus;
  notes: string | null;
  placementFeeEur: number | null;
  repliedAt: string | null;
  createdAt: string;
};

type PacketSendRow = {
  id: string;
  package_id: string;
  contact_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_company: string | null;
  sent_at: string;
  channel: string;
  status: string;
  notes: string | null;
  placement_fee_eur: number | null;
  replied_at: string | null;
  created_at: string;
};

function rowToPacketSend(row: PacketSendRow): PacketSend {
  return {
    id: row.id,
    packageId: row.package_id,
    contactId: row.contact_id,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactCompany: row.contact_company,
    sentAt: row.sent_at,
    channel: row.channel as SendChannel,
    status: row.status as SendStatus,
    notes: row.notes,
    placementFeeEur: row.placement_fee_eur,
    repliedAt: row.replied_at,
    createdAt: row.created_at,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────

export async function listPacketSends(
  packageId: string,
  orgId: string,
): Promise<PacketSend[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];

  const { data } = await svc
    .from("submission_packet_sends")
    .select(
      "id, package_id, contact_id, contact_name, contact_email, contact_company, sent_at, channel, status, notes, placement_fee_eur, replied_at, created_at",
    )
    .eq("package_id", packageId)
    .eq("org_id", orgId)
    .order("sent_at", { ascending: false });

  return (data ?? []).map(rowToPacketSend);
}

export async function createPacketSend(
  packageId: string,
  orgId: string,
  input: {
    contactName: string;
    contactEmail?: string;
    contactCompany?: string;
    channel: SendChannel;
    notes?: string;
  },
): Promise<PacketSend | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;

  const { data } = await svc
    .from("submission_packet_sends")
    .insert({
      org_id: orgId,
      package_id: packageId,
      contact_name: input.contactName,
      contact_email: input.contactEmail ?? null,
      contact_company: input.contactCompany ?? null,
      channel: input.channel,
      notes: input.notes ?? null,
    })
    .select(
      "id, package_id, contact_id, contact_name, contact_email, contact_company, sent_at, channel, status, notes, placement_fee_eur, replied_at, created_at",
    )
    .single();

  return data ? rowToPacketSend(data) : null;
}

export async function updatePacketSend(
  sendId: string,
  orgId: string,
  input: {
    status?: SendStatus;
    notes?: string;
    placementFeeEur?: number | null;
    repliedAt?: string | null;
  },
): Promise<PacketSend | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;

  // Build only the fields that were provided
  const patch: Record<string, unknown> = {};
  if (input.status !== undefined) patch.status = input.status;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.placementFeeEur !== undefined) patch.placement_fee_eur = input.placementFeeEur;
  if (input.repliedAt !== undefined) patch.replied_at = input.repliedAt;

  if (Object.keys(patch).length === 0) return null;

  const { data } = await svc
    .from("submission_packet_sends")
    .update(patch)
    .eq("id", sendId)
    .eq("org_id", orgId)
    .select(
      "id, package_id, contact_id, contact_name, contact_email, contact_company, sent_at, channel, status, notes, placement_fee_eur, replied_at, created_at",
    )
    .single();

  return data ? rowToPacketSend(data) : null;
}
