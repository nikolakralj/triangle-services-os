import { z } from "zod";

export const aiGenerationRequestSchema = z.object({
  generationType: z.enum([
    "company_summary",
    "lead_score",
    "outreach_email",
    "follow_up_email",
    "call_script",
    "meeting_summary",
    "weekly_report",
    "document_template",
    "proposal_draft",
    "other",
  ]),
  companyId: z.string().optional(),
  contactId: z.string().optional(),
  opportunityId: z.string().optional(),
  language: z.enum(["en", "de", "hr"]).optional().default("en"),
  tone: z.string().optional().default("professional"),
  offerType: z.string().optional(),
  customInstructions: z.string().max(4000).optional(),
});

export const csvImportSchema = z.object({
  importType: z.enum(["csv_companies", "csv_contacts"]),
  rows: z.array(z.record(z.string(), z.unknown())).max(5000),
});

export const externalLeadSchema = z.object({
  source_name: z.string().min(1),
  source_query: z.string().optional(),
  source_url: z.string().optional(),
  items: z
    .array(
      z.object({
        company_name: z.string().min(1),
        website: z.string().optional(),
        country: z.string().optional(),
        city: z.string().optional(),
        company_type: z.string().optional(),
        sectors: z.array(z.string()).optional(),
        source_url: z.string().optional(),
        source_description: z.string().optional(),
        notes: z.string().optional(),
        contacts: z
          .array(
            z.object({
              full_name: z.string().min(1),
              job_title: z.string().optional(),
              email: z.string().email().optional(),
              linkedin_url: z.string().optional(),
            }),
          )
          .optional(),
      }),
    )
    .max(1000),
});

export const stageUpdateSchema = z.object({
  stageId: z.string().min(1),
});

export const activitySchema = z.object({
  activityType: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().optional(),
  body: z.string().optional(),
  companyId: z.string().optional(),
  contactId: z.string().optional(),
  opportunityId: z.string().optional(),
  workerId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const documentMetadataSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  documentCategory: z.string().min(1),
  linkedEntityType: z.string().optional(),
  linkedEntityId: z.string().optional(),
  storageBucket: z.string().optional().default("documents"),
  storagePath: z.string().min(1),
  fileName: z.string().min(1),
  fileExtension: z.string().optional(),
  mimeType: z.string().optional(),
  fileSize: z.number().optional(),
  visibility: z.string().optional().default("internal"),
  sensitivity: z.string().optional().default("normal"),
  expiryDate: z.string().optional(),
  reviewDate: z.string().optional(),
});
