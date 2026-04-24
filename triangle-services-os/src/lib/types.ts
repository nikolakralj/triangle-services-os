export type Role = "admin" | "partner" | "researcher" | "viewer";

export type Priority = "low" | "medium" | "high" | "critical";

export type CompanyStatus =
  | "research"
  | "target"
  | "contact_found"
  | "contacted"
  | "replied"
  | "meeting"
  | "vendor_registration"
  | "rfq"
  | "offer_sent"
  | "won"
  | "lost"
  | "not_relevant"
  | "do_not_contact";

export type Company = {
  id: string;
  name: string;
  legalName?: string;
  companyType: string;
  status: CompanyStatus;
  country: string;
  city: string;
  website: string;
  websiteDomain: string;
  linkedinUrl?: string;
  sourceUrl?: string;
  sectors: string[];
  targetCountries: string[];
  priority: Priority;
  leadScore: number;
  leadScoreReason: string;
  owner: "Nikola" | "Ralph";
  description: string;
  currentProjects?: string;
  painPoints?: string;
  notes?: string;
  lastContactAt?: string;
  nextActionAt?: string;
};

export type Contact = {
  id: string;
  companyId: string;
  fullName: string;
  jobTitle: string;
  roleCategory: string;
  email: string;
  phone?: string;
  linkedinUrl?: string;
  language: "English" | "German" | "Croatian";
  country: string;
  priority: Priority;
  owner: "Nikola" | "Ralph";
  lastContactAt?: string;
  nextActionAt?: string;
  optOut: boolean;
  doNotContact: boolean;
};

export type PipelineStage = {
  id: string;
  key: string;
  name: string;
  description: string;
  sortOrder: number;
  color: string;
  isWon?: boolean;
  isLost?: boolean;
};

export type Opportunity = {
  id: string;
  companyId: string;
  primaryContactId?: string;
  stageId: string;
  title: string;
  opportunityType: string;
  sector: string;
  country: string;
  city?: string;
  siteLocation?: string;
  estimatedValue?: number;
  estimatedMonthlyValue?: number;
  currency: "EUR";
  probability: number;
  estimatedCrewSize?: number;
  estimatedSupervisors?: number;
  expectedStartDate?: string;
  expectedDurationWeeks?: number;
  scopeSummary?: string;
  clientNeed?: string;
  nextStep?: string;
  owner: "Nikola" | "Ralph";
  nextActionAt?: string;
  status: "open" | "won" | "lost" | "paused" | "nurture";
};

export type Task = {
  id: string;
  title: string;
  description?: string;
  assignedTo: "Nikola" | "Ralph";
  relatedEntityType:
    | "company"
    | "contact"
    | "opportunity"
    | "worker"
    | "document"
    | "none";
  relatedEntityId?: string;
  priority: Priority;
  status: "open" | "in_progress" | "done" | "cancelled";
  dueDate?: string;
};

export type Activity = {
  id: string;
  activityType:
    | "note"
    | "call"
    | "email"
    | "meeting"
    | "linkedin_message"
    | "document_sent"
    | "document_received"
    | "ai_generation"
    | "status_change"
    | "task_completed"
    | "import"
    | "other";
  title: string;
  summary: string;
  companyId?: string;
  contactId?: string;
  opportunityId?: string;
  workerId?: string;
  occurredAt: string;
  createdBy: "Nikola" | "Ralph";
};

export type DocumentRecord = {
  id: string;
  title: string;
  documentCategory: string;
  linkedEntityType?: string;
  linkedEntityId?: string;
  fileName: string;
  fileExtension: string;
  version: number;
  visibility: "internal" | "admin_only" | "partner_only" | "researcher_allowed";
  sensitivity:
    | "normal"
    | "confidential"
    | "highly_confidential"
    | "personal_data"
    | "financial"
    | "legal";
  reviewDate?: string;
  expiryDate?: string;
  uploadedBy: "Nikola" | "Ralph";
  uploadedAt: string;
};

export type ChecklistItem = {
  id: string;
  title: string;
  category: string;
  status: "missing" | "draft" | "uploaded" | "approved" | "expired";
  owner: "Nikola" | "Ralph";
  reviewDate?: string;
  linkedDocumentId?: string;
  notes?: string;
};

export type Worker = {
  id: string;
  fullName: string;
  role: string;
  workerType: string;
  email?: string;
  phone?: string;
  country: string;
  city?: string;
  languages: string[];
  skills: string[];
  certificates: string[];
  industries: string[];
  availabilityStatus: "available" | "available_soon" | "busy" | "unknown" | "do_not_use";
  availableFrom?: string;
  preferredCountries: string[];
  hourlyRateExpectation?: number;
  dailyRateExpectation?: number;
  currency: "EUR";
  reliabilityScore: number;
  qualityScore: number;
  safetyScore: number;
  hasA1Possible?: boolean;
  hasOwnTools?: boolean;
  hasCar?: boolean;
  status: "active" | "inactive" | "blacklisted" | "candidate";
};

export type AIGenerationRequest = {
  generationType:
    | "company_summary"
    | "lead_score"
    | "outreach_email"
    | "follow_up_email"
    | "call_script"
    | "meeting_summary"
    | "weekly_report"
    | "document_template"
    | "proposal_draft"
    | "other";
  companyId?: string;
  contactId?: string;
  opportunityId?: string;
  language?: "en" | "de" | "hr";
  tone?: string;
  offerType?: string;
  customInstructions?: string;
};
