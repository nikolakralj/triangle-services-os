import { z } from "zod";

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (value === "" || value == null ? undefined : value),
    z.string().trim().max(max).optional(),
  );

const optionalDate = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
);

const optionalDateTime = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  z.string().datetime({ offset: true }).optional(),
);

const optionalPositiveInt = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  z.coerce.number().int().positive().optional(),
);

const optionalNonNegativeInt = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  z.coerce.number().int().nonnegative().optional(),
);

const optionalMoney = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  z.coerce.number().nonnegative().optional(),
);

const textArray = z
  .array(z.string().trim().min(1).max(160))
  .max(100)
  .default([]);

export const requirementStatusSchema = z.enum([
  "draft",
  "needs_information",
  "qualified",
  "disqualified",
  "proposal_ready",
  "ordered",
  "closed",
]);

// Zod cannot .omit() from a schema that carries a .refine(): the refinement
// wraps the object and the result is no longer an object schema. Keeping the
// plain object separate means the patch schema can drop `source` and still
// re-apply the same rule, instead of the patch silently losing it.
const requirementObjectSchema = z
  .object({
    source: z.string().trim().min(1).max(100).default("manual"),
    title: z.string().trim().min(1).max(240),
    projectPackageId: z.string().uuid().optional(),
    scopeSummary: optionalText(4_000),
    exclusions: optionalText(2_000),
    roles: textArray,
    headcountMin: optionalPositiveInt,
    headcountMax: optionalPositiveInt,
    seniority: optionalText(200),
    country: optionalText(120),
    city: optionalText(160),
    siteLocation: optionalText(300),
    startDateFrom: optionalDate,
    startDateTo: optionalDate,
    startWindowText: optionalText(300),
    durationWeeks: optionalPositiveInt,
    durationText: optionalText(300),
    shiftPattern: optionalText(300),
    requiredSkills: textArray,
    requiredDocuments: textArray,
    engagementModel: z
      .enum([
        "unknown",
        "individual_contract",
        "team_supply",
        "managed_crew",
        "subcontract_scope",
        "recruitment_fee",
        "framework_calloff",
      ])
      .default("unknown"),
    budgetMin: optionalMoney,
    budgetMax: optionalMoney,
    currency: z.string().trim().regex(/^[A-Z]{3}$/).default("EUR"),
    rateUnit: z
      .enum(["hour", "day", "week", "month", "fixed", "placement_fee"])
      .optional(),
    paymentTermsDays: optionalNonNegativeInt,
    commercialNotes: optionalText(4_000),
    countryFeasibilityState: z
      .enum(["unknown", "review_needed", "feasible", "blocked"])
      .default("unknown"),
    supplierOnboardingState: z
      .enum([
        "unknown",
        "not_required",
        "researching",
        "in_progress",
        "approved",
        "blocked",
        "rejected",
      ])
      .default("unknown"),
    unknowns: textArray,
    demandEvidenceUrl: optionalText(2_000),
    demandEvidenceSummary: optionalText(4_000),
    demandEvidenceDate: optionalDate,
    nextAction: optionalText(1_000),
    nextActionDueAt: optionalDateTime,
  });

/** Both fields are optional, so this holds on a partial patch too. */
const headcountRangeIsSane = (value: {
  headcountMin?: number;
  headcountMax?: number;
}) =>
  !value.headcountMin ||
  !value.headcountMax ||
  value.headcountMax >= value.headcountMin;

const HEADCOUNT_RANGE_MESSAGE = {
  message: "Maximum headcount must be at least minimum headcount.",
};

export const requirementInputSchema = requirementObjectSchema.refine(
  headcountRangeIsSane,
  HEADCOUNT_RANGE_MESSAGE,
);

export const requirementPatchSchema = requirementObjectSchema
  .omit({ source: true })
  .partial()
  .extend({
    status: requirementStatusSchema.optional(),
    decisionReason: optionalText(2_000),
    buyerConfirmed: z.boolean().optional(),
  })
  // The database enforces this too; failing here gives the reason in words
  // rather than a raw constraint violation.
  .refine(headcountRangeIsSane, HEADCOUNT_RANGE_MESSAGE);

const buyerRouteObjectSchema = z
  .object({
    requirementId: z.string().uuid(),
    chainNodeId: z.string().uuid().optional(),
    buyerContactId: z.string().uuid().optional(),
    routeType: z.enum([
      "direct_buyer",
      "recruiter",
      "framework",
      "supplier_portal",
      "referral",
      "subcontractor",
      "other",
    ]),
    routeStatus: z.enum([
      "unknown",
      "researching",
      "contact_identified",
      "contacted",
      "prequalification",
      "confirmed",
      "approved",
      "blocked",
      "rejected",
      "dormant",
    ]),
    contractingEntity: optionalText(300),
    buyerCompany: optionalText(300),
    buyerContactName: optionalText(300),
    buyerContactEmail: z.preprocess(
      (value) => (value === "" || value == null ? undefined : value),
      z.string().email().max(320).optional(),
    ),
    portalUrl: optionalText(2_000),
    evidenceUrl: optionalText(2_000),
    evidenceSummary: optionalText(4_000),
    onboardingRequirements: optionalText(4_000),
    engagementModel: optionalText(300),
    nextAction: optionalText(1_000),
    nextActionDueAt: optionalDateTime,
  });

export const buyerRouteInputSchema = buyerRouteObjectSchema.refine(
  (value) =>
    Boolean(
      value.chainNodeId ||
        value.buyerContactId ||
        value.contractingEntity ||
        value.buyerCompany ||
        value.buyerContactName ||
        value.portalUrl,
    ),
  { message: "Identify a company, contact, portal, or contractor-chain node." },
);

// Creating a route demands at least one identifier; editing one does not
// re-demand it, or you could never change a next action without re-typing who
// the buyer is.
export const buyerRoutePatchSchema = buyerRouteObjectSchema
  .omit({ requirementId: true })
  .partial();

export const commercialActionInputSchema = z.object({
  requirementId: z.string().uuid(),
  buyerRouteId: z.string().uuid().optional(),
  projectPackageId: z.string().uuid().optional(),
  actionType: z.enum([
    "email",
    "call",
    "linkedin",
    "meeting",
    "packet",
    "proposal",
    "prequalification",
    "note",
    "other",
  ]),
  status: z.enum([
    "draft",
    "planned",
    "completed",
    "responded",
    "no_response",
    "cancelled",
  ]),
  channel: optionalText(100),
  recipientName: optionalText(300),
  recipientEmail: z.preprocess(
    (value) => (value === "" || value == null ? undefined : value),
    z.string().email().max(320).optional(),
  ),
  recipientCompany: optionalText(300),
  subject: optionalText(500),
  aiDraft: optionalText(20_000),
  finalContent: optionalText(20_000),
  occurredAt: optionalDateTime,
  followUpAt: optionalDateTime,
  responseSummary: optionalText(4_000),
  objection: optionalText(2_000),
  outcome: optionalText(2_000),
  nextAction: optionalText(1_000),
  nextActionDueAt: optionalDateTime,
});

export const commercialActionPatchSchema = commercialActionInputSchema
  .omit({ requirementId: true })
  .partial();
