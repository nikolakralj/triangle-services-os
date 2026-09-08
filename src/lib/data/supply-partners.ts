import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// The other half of the talent pool.
//
// "In future I will have talent pool with companies not only individual
// person."
//
// It is not a future problem. Triangle has two people on the bench, and a crew
// package for eight electricians cannot be assembled from two. It comes from a
// partner firm that already employs eight. Until this existed, the supply-first
// rule shipped on 8 September — start from supply, refuse any trade Triangle
// does not have — could only ever read the two, and would refuse work Triangle
// can actually deliver.
//
// A partner is not a worker and not a lead. See migration 040 for why it is
// neither a row in `workers` nor a flag on `companies`.
// ---------------------------------------------------------------------------

/**
 * How long a confirmed capacity claim stays true.
 *
 * Hanna's brief has said 14 days for a person's availability since 1
 * September, and nothing in the codebase has ever enforced it — the usual
 * shape of a rule that lives only in a brief. A partner firm's capacity decays
 * the same way and for the same reason: their people get placed on someone
 * else's job without telling us.
 */
export const CAPACITY_SHELF_LIFE_DAYS = 14;

export type PartnerAvailability =
  | "available"
  | "available_soon"
  | "busy"
  | "unknown"
  | "do_not_use";

export interface SupplyPartner {
  id: string;
  companyId: string | null;
  name: string;
  legalName: string | null;
  country: string | null;
  city: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  trades: string[];
  industries: string[];
  languages: string[];
  certificates: string[];
  crewSize: number | null;
  canPostTo: string[];
  postingNotes: string | null;
  availabilityStatus: PartnerAvailability;
  availableFrom: string | null;
  confirmedAt: string | null;
  confirmedNote: string | null;
  rateNotes: string | null;
  notes: string | null;
  status: "candidate" | "active" | "inactive" | "do_not_use";
  createdAt: string;
  /** Days since a human last confirmed the capacity. Null if never confirmed. */
  confirmedDaysAgo: number | null;
  /** Confirmed, recently enough, available, and not parked. */
  sellable: boolean;
  /** Why it is not sellable, in the words the CEO would use. */
  notSellableBecause: string | null;
}

type Row = Record<string, unknown>;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86_400_000);
}

/**
 * The one judgement this module makes, in one place.
 *
 * A partner firm is supply only when a human has heard the capacity from them
 * recently. Everything else — a firm found on a website, a firm that had twelve
 * electricians in March — is a lead on supply, not supply. Selling the second
 * kind is how a package gets signed and then cannot be delivered.
 */
function judge(
  status: string,
  availability: string,
  confirmedDaysAgo: number | null,
): { sellable: boolean; because: string | null } {
  if (status === "do_not_use") return { sellable: false, because: "Marked do not use" };
  if (status === "inactive") return { sellable: false, because: "Not an active partner" };
  if (availability === "do_not_use") return { sellable: false, because: "Marked do not use" };
  if (availability === "busy") return { sellable: false, because: "Told us they are busy" };
  if (confirmedDaysAgo === null) {
    return { sellable: false, because: "Nobody has confirmed their capacity yet" };
  }
  if (confirmedDaysAgo > CAPACITY_SHELF_LIFE_DAYS) {
    return {
      sellable: false,
      because: `Capacity last confirmed ${confirmedDaysAgo} days ago — ask again`,
    };
  }
  if (availability === "unknown") {
    return { sellable: false, because: "Availability not stated" };
  }
  return { sellable: true, because: null };
}

function toPartner(r: Row): SupplyPartner {
  const confirmedAt = (r.confirmed_at as string | null) ?? null;
  const confirmedDaysAgo = daysSince(confirmedAt);
  const status = String(r.status ?? "candidate") as SupplyPartner["status"];
  const availabilityStatus = String(
    r.availability_status ?? "unknown",
  ) as PartnerAvailability;
  const verdict = judge(status, availabilityStatus, confirmedDaysAgo);
  return {
    id: String(r.id),
    companyId: (r.company_id as string | null) ?? null,
    name: String(r.name ?? ""),
    legalName: (r.legal_name as string | null) ?? null,
    country: (r.country as string | null) ?? null,
    city: (r.city as string | null) ?? null,
    contactName: (r.contact_name as string | null) ?? null,
    contactEmail: (r.contact_email as string | null) ?? null,
    contactPhone: (r.contact_phone as string | null) ?? null,
    trades: (r.trades as string[] | null) ?? [],
    industries: (r.industries as string[] | null) ?? [],
    languages: (r.languages as string[] | null) ?? [],
    certificates: (r.certificates as string[] | null) ?? [],
    crewSize: (r.crew_size as number | null) ?? null,
    canPostTo: (r.can_post_to as string[] | null) ?? [],
    postingNotes: (r.posting_notes as string | null) ?? null,
    availabilityStatus,
    availableFrom: (r.available_from as string | null) ?? null,
    confirmedAt,
    confirmedNote: (r.confirmed_note as string | null) ?? null,
    rateNotes: (r.rate_notes as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    status,
    createdAt: String(r.created_at ?? ""),
    confirmedDaysAgo,
    sellable: verdict.sellable,
    notSellableBecause: verdict.because,
  };
}

const COLUMNS =
  "id, company_id, name, legal_name, country, city, contact_name, contact_email, contact_phone, trades, industries, languages, certificates, crew_size, can_post_to, posting_notes, availability_status, available_from, confirmed_at, confirmed_note, rate_notes, notes, status, created_at";

export async function listSupplyPartners(orgId: string): Promise<SupplyPartner[]> {
  const service = createServiceSupabaseClient();
  if (!service) return [];
  const { data } = await service
    .from("supply_partners")
    .select(COLUMNS)
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(200);
  return (data ?? []).map(toPartner);
}

export async function getSupplyPartner(
  id: string,
  orgId: string,
): Promise<SupplyPartner | null> {
  const service = createServiceSupabaseClient();
  if (!service) return null;
  const { data } = await service
    .from("supply_partners")
    .select(COLUMNS)
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  return data ? toPartner(data) : null;
}

export interface NewSupplyPartner {
  name: string;
  country?: string | null;
  city?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  trades?: string[];
  crewSize?: number | null;
  canPostTo?: string[];
  postingNotes?: string | null;
  availabilityStatus?: PartnerAvailability;
  rateNotes?: string | null;
  notes?: string | null;
  companyId?: string | null;
}

export async function createSupplyPartner(
  orgId: string,
  userId: string | null,
  input: NewSupplyPartner,
): Promise<SupplyPartner | null> {
  const service = createServiceSupabaseClient();
  if (!service) return null;
  const name = input.name.trim();
  if (!name) return null;
  const { data, error } = await service
    .from("supply_partners")
    .insert({
      organization_id: orgId,
      company_id: input.companyId ?? null,
      name,
      country: input.country?.trim() || null,
      city: input.city?.trim() || null,
      contact_name: input.contactName?.trim() || null,
      contact_email: input.contactEmail?.trim() || null,
      contact_phone: input.contactPhone?.trim() || null,
      trades: (input.trades ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 30),
      can_post_to: (input.canPostTo ?? []).map((c) => c.trim()).filter(Boolean).slice(0, 30),
      crew_size:
        typeof input.crewSize === "number" && Number.isFinite(input.crewSize)
          ? Math.max(0, Math.round(input.crewSize))
          : null,
      posting_notes: input.postingNotes?.trim() || null,
      availability_status: input.availabilityStatus ?? "unknown",
      rate_notes: input.rateNotes?.trim() || null,
      notes: input.notes?.trim() || null,
      // Never confirmed on creation, whatever the form says. Typing a number
      // into a box is not the same as a partner telling you they have the
      // people, and this table exists to keep those two apart.
      confirmed_at: null,
      created_by: userId,
    })
    .select(COLUMNS)
    .single();
  if (error || !data) return null;
  return toPartner(data);
}

/**
 * A human just spoke to them and heard the number.
 *
 * This is the only way confirmed_at is ever set — there is no form field for
 * it, because a field would let someone confirm capacity without asking
 * anyone. The note is what they actually said.
 */
export async function confirmPartnerCapacity(params: {
  partnerId: string;
  orgId: string;
  userId: string | null;
  crewSize?: number | null;
  availabilityStatus?: PartnerAvailability;
  availableFrom?: string | null;
  note?: string | null;
}): Promise<SupplyPartner | null> {
  const service = createServiceSupabaseClient();
  if (!service) return null;
  const patch: Record<string, unknown> = {
    confirmed_at: new Date().toISOString(),
    confirmed_by: params.userId,
    confirmed_note: params.note?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  if (typeof params.crewSize === "number" && Number.isFinite(params.crewSize)) {
    patch.crew_size = Math.max(0, Math.round(params.crewSize));
  }
  if (params.availabilityStatus) patch.availability_status = params.availabilityStatus;
  if (params.availableFrom !== undefined) patch.available_from = params.availableFrom;

  const { data, error } = await service
    .from("supply_partners")
    .update(patch)
    .eq("id", params.partnerId)
    .eq("organization_id", params.orgId)
    .select(COLUMNS)
    .single();
  if (error || !data) return null;
  return toPartner(data);
}

export async function setPartnerStatus(
  partnerId: string,
  orgId: string,
  status: SupplyPartner["status"],
): Promise<boolean> {
  const service = createServiceSupabaseClient();
  if (!service) return false;
  const { error } = await service
    .from("supply_partners")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", partnerId)
    .eq("organization_id", orgId);
  return !error;
}
