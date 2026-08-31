import { z } from "zod";

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (value === "" || value == null ? undefined : value),
    z.string().trim().max(max).optional(),
  );
const optionalUuid = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  z.string().uuid().optional(),
);
const optionalDate = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
);
const optionalDateTime = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  z.string().datetime({ offset: true }).optional(),
);
const optionalMoney = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  z.coerce.number().nonnegative().optional(),
);
const optionalNonNegativeInt = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  z.coerce.number().int().nonnegative().optional(),
);
const currency = z.string().trim().regex(/^[A-Z]{3}$/);

export const orderCreateSchema = z.object({
  operation: z.literal("create_order"),
  requirementId: z.string().uuid(),
  buyerRouteId: optionalUuid,
  projectPackageId: optionalUuid,
  orderType: z.enum(["nda","msa","framework","sow","job_order","purchase_order","rate_card","placement_order","other"]),
  title: z.string().trim().min(1).max(240),
  externalReference: optionalText(300),
  buyerContractingEntity: optionalText(300),
  supplierLegalEntity: optionalText(300),
  scopeSummary: optionalText(4_000),
  currency: currency.default("EUR"),
  contractValue: optionalMoney,
  startDate: optionalDate,
  endDate: optionalDate,
  paymentTermsDays: optionalNonNegativeInt,
  timesheetFrequency: optionalText(200),
  timesheetApprovalContact: optionalText(300),
  billRate: optionalMoney,
  costRate: optionalMoney,
  rateUnit: optionalText(100),
  travelResponsibility: optionalText(1_000),
  accommodationResponsibility: optionalText(1_000),
  toolsPpeResponsibility: optionalText(1_000),
  terminationTerms: optionalText(2_000),
  replacementTerms: optionalText(2_000),
  liabilityNotes: optionalText(2_000),
  legalReviewStatus: z.enum(["not_reviewed","review_needed","in_review","approved","rejected"]).default("not_reviewed"),
  nextAction: optionalText(1_000),
  nextActionDueAt: optionalDateTime,
});

export const orderUpdateSchema = orderCreateSchema.omit({ operation: true, requirementId: true }).partial().extend({
  operation: z.literal("update_order"),
  orderId: z.string().uuid(),
  status: z.enum(["draft","under_review","signed","active","completed","terminated","cancelled"]).optional(),
  signedAt: optionalDateTime,
  humanApproved: z.boolean().optional(),
});

export const reservationCreateSchema = z.object({
  operation: z.literal("create_reservation"),
  orderId: z.string().uuid(),
  workerId: z.string().uuid(),
  status: z.enum(["hold","reserved","confirmed"]).default("hold"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  confirmationSource: optionalText(1_000),
  notes: optionalText(2_000),
});

export const reservationUpdateSchema = z.object({
  operation: z.literal("update_reservation"),
  reservationId: z.string().uuid(),
  status: z.enum(["hold","reserved","confirmed","released","cancelled"]),
  confirmationSource: optionalText(1_000),
  notes: optionalText(2_000),
});

export const mobilizationCreateSchema = z.object({
  operation: z.literal("create_mobilization"),
  orderId: z.string().uuid(),
  reservationId: z.string().uuid(),
  workerId: z.string().uuid(),
  plannedStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  plannedEndDate: optionalDate,
  siteLocation: optionalText(500),
  siteContact: optionalText(300),
  supervisorName: optionalText(300),
  nextAction: optionalText(1_000),
  nextActionDueAt: optionalDateTime,
});

export const mobilizationUpdateSchema = z.object({
  operation: z.literal("update_mobilization"),
  mobilizationId: z.string().uuid(),
  status: z.enum(["planned","blocked","ready","mobilized","active","completed","cancelled"]),
  blockerSummary: optionalText(2_000),
  actualStartAt: optionalDateTime,
  actualEndAt: optionalDateTime,
  nextAction: optionalText(1_000),
  nextActionDueAt: optionalDateTime,
});

export const checklistUpdateSchema = z.object({
  operation: z.literal("update_mobilization_checklist"),
  checklistItemId: z.string().uuid(),
  status: z.enum(["missing","in_progress","ready","not_required","blocked"]),
  evidenceDocumentId: optionalUuid,
  notes: optionalText(2_000),
  dueAt: optionalDateTime,
});

export const timesheetCreateSchema = z.object({
  operation: z.literal("create_timesheet"),
  orderId: z.string().uuid(),
  mobilizationId: optionalUuid,
  workerId: z.string().uuid(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  regularHours: z.coerce.number().nonnegative(),
  overtimeHours: z.coerce.number().nonnegative().default(0),
  billRate: optionalMoney,
  costRate: optionalMoney,
  currency: currency,
  status: z.enum(["draft","submitted","client_approved"]).default("draft"),
  clientApproverName: optionalText(300),
  clientApprovalEvidence: optionalText(2_000),
  notes: optionalText(2_000),
});

export const timesheetUpdateSchema = z.object({
  operation: z.literal("update_timesheet"),
  timesheetId: z.string().uuid(),
  status: z.enum(["draft","submitted","client_approved","rejected"]),
  clientApproverName: optionalText(300),
  clientApprovalEvidence: optionalText(2_000),
  rejectionReason: optionalText(2_000),
  notes: optionalText(2_000),
});

export const invoiceCreateSchema = z.object({
  operation: z.literal("create_invoice"),
  orderId: z.string().uuid(),
  invoiceNumber: z.string().trim().min(1).max(200),
  status: z.enum(["draft","issued","sent"]).default("draft"),
  issueDate: optionalDate,
  dueDate: optionalDate,
  currency: currency,
  netAmount: z.coerce.number().nonnegative(),
  taxAmount: z.coerce.number().nonnegative().default(0),
  timesheetIds: z.array(z.string().uuid()).max(500).default([]),
  notes: optionalText(2_000),
});

export const invoiceUpdateSchema = z.object({
  operation: z.literal("update_invoice"),
  invoiceId: z.string().uuid(),
  status: z.enum(["draft","issued","sent","overdue","disputed","void"]),
  issueDate: optionalDate,
  dueDate: optionalDate,
  disputeReason: optionalText(2_000),
  notes: optionalText(2_000),
});

export const paymentCreateSchema = z.object({
  operation: z.literal("record_payment"),
  invoiceId: z.string().uuid(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.coerce.number().positive(),
  currency: currency,
  paymentReference: optionalText(300),
  method: optionalText(100),
  notes: optionalText(2_000),
});

export const costCreateSchema = z.object({
  operation: z.literal("record_cost"),
  orderId: z.string().uuid(),
  mobilizationId: optionalUuid,
  workerId: optionalUuid,
  costType: z.enum(["labor","payroll_tax","travel","accommodation","per_diem","ppe_tools","training","insurance","admin","financing","other"]),
  costState: z.enum(["forecast","committed","actual"]),
  costDate: optionalDate,
  amount: z.coerce.number().nonnegative(),
  currency: currency,
  description: optionalText(2_000),
});

export const costUpdateSchema = z.object({
  operation: z.literal("update_cost"),
  costId: z.string().uuid(),
  costType: z.enum(["labor","payroll_tax","travel","accommodation","per_diem","ppe_tools","training","insurance","admin","financing","other"]).optional(),
  costState: z.enum(["forecast","committed","actual"]),
  costDate: optionalDate,
  amount: optionalMoney,
  description: optionalText(2_000),
});

export const deliveryMutationSchema = z.discriminatedUnion("operation", [
  orderCreateSchema,
  orderUpdateSchema,
  reservationCreateSchema,
  reservationUpdateSchema,
  mobilizationCreateSchema,
  mobilizationUpdateSchema,
  checklistUpdateSchema,
  timesheetCreateSchema,
  timesheetUpdateSchema,
  invoiceCreateSchema,
  invoiceUpdateSchema,
  paymentCreateSchema,
  costUpdateSchema,
  costCreateSchema,
]);
