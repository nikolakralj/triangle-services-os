import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export const OPERATING_MODELS = [
  "crew_supplier",
  "contract_staffing_agency",
  "recruitment_agency",
  "independent_recruiter",
] as const;

export const OFFER_MODES = ["teams", "individuals", "both"] as const;

export type OperatingModel = (typeof OPERATING_MODELS)[number];
export type OfferMode = (typeof OFFER_MODES)[number];

export interface OrganizationOperatingProfile {
  name: string;
  legalName: string | null;
  country: string | null;
  website: string | null;
  operatingModel: OperatingModel;
  offerMode: OfferMode;
  companyProfile: string;
  replySignoff: string;
  defaultCurrency: string;
  timezone: string;
  updatedAt: string | null;
}

type OrganizationProfileRow = {
  name?: unknown;
  legal_name?: unknown;
  country?: unknown;
  website?: unknown;
  operating_model?: unknown;
  offer_mode?: unknown;
  company_profile?: unknown;
  reply_signoff?: unknown;
  default_currency?: unknown;
  timezone?: unknown;
  updated_at?: unknown;
};

export const DEMO_ORGANIZATION_PROFILE: OrganizationOperatingProfile = {
  name: "Triangle Services",
  legalName: "Triangle Services",
  country: "Croatia",
  website: null,
  operatingModel: "crew_supplier",
  offerMode: "both",
  companyProfile:
    "Triangle Services supplies specialist automation, commissioning, and electrical contractors and crews to industrial projects across Europe.",
  replySignoff: "Nikola Kralj\nTriangle Services",
  defaultCurrency: "EUR",
  timezone: "Europe/Zagreb",
  updatedAt: null,
};

function stringOrNull(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeOperatingModel(value: unknown): OperatingModel {
  const normalized = String(value ?? "");
  return (OPERATING_MODELS as readonly string[]).includes(normalized)
    ? (normalized as OperatingModel)
    : "crew_supplier";
}

function normalizeOfferMode(value: unknown): OfferMode {
  const normalized = String(value ?? "");
  return (OFFER_MODES as readonly string[]).includes(normalized)
    ? (normalized as OfferMode)
    : "both";
}

function rowToProfile(row: OrganizationProfileRow): OrganizationOperatingProfile {
  return {
    name: String(row.name ?? "").trim(),
    legalName: stringOrNull(row.legal_name),
    country: stringOrNull(row.country),
    website: stringOrNull(row.website),
    operatingModel: normalizeOperatingModel(row.operating_model),
    offerMode: normalizeOfferMode(row.offer_mode),
    companyProfile: String(row.company_profile ?? "").trim(),
    replySignoff: String(row.reply_signoff ?? "").trim(),
    defaultCurrency: String(row.default_currency ?? "EUR").trim().toUpperCase(),
    timezone: String(row.timezone ?? "UTC").trim(),
    updatedAt: stringOrNull(row.updated_at),
  };
}

const PROFILE_COLUMNS = [
  "name",
  "legal_name",
  "country",
  "website",
  "operating_model",
  "offer_mode",
  "company_profile",
  "reply_signoff",
  "default_currency",
  "timezone",
  "updated_at",
].join(",");

export function isOrganizationProfileComplete(
  profile: OrganizationOperatingProfile | null,
): profile is OrganizationOperatingProfile {
  return Boolean(
    profile?.name.trim() &&
      profile.companyProfile.trim() &&
      profile.replySignoff.trim(),
  );
}

export async function getOrganizationOperatingProfile(
  orgId: string,
): Promise<OrganizationOperatingProfile | null> {
  const service = createServiceSupabaseClient();
  if (!service) return null;

  const { data, error } = await service
    .from("organizations")
    .select(PROFILE_COLUMNS)
    .eq("id", orgId)
    .maybeSingle();

  if (error || !data) return null;
  return rowToProfile(data as OrganizationProfileRow);
}

export async function updateOrganizationOperatingProfile(params: {
  orgId: string;
  userId: string | null;
  name: string;
  operatingModel: OperatingModel;
  offerMode: OfferMode;
  companyProfile: string;
  replySignoff: string;
  defaultCurrency: string;
  timezone: string;
}): Promise<OrganizationOperatingProfile | null> {
  const service = createServiceSupabaseClient();
  if (!service) return null;

  const { data, error } = await service
    .from("organizations")
    .update({
      name: params.name.trim().slice(0, 160),
      operating_model: params.operatingModel,
      offer_mode: params.offerMode,
      company_profile: params.companyProfile.trim().slice(0, 4_000),
      reply_signoff: params.replySignoff.trim().slice(0, 500),
      default_currency: params.defaultCurrency.trim().toUpperCase(),
      timezone: params.timezone.trim().slice(0, 100),
      profile_updated_by: params.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.orgId)
    .select(PROFILE_COLUMNS)
    .maybeSingle();

  if (error || !data) return null;
  return rowToProfile(data as OrganizationProfileRow);
}
