export type ChainKnowledgeLevel = "known" | "inferred" | "unknown";

export type ChainRole =
  | "owner"
  | "developer"
  | "epc"
  | "gc"
  | "mep"
  | "electrical"
  | "intermediary"
  | "other";

export type ContractorChainNodeRow = {
  id: string;
  organization_id: string;
  discovered_project_id: string;
  role: ChainRole;
  label: string;
  company_name: string | null;
  company_id: string | null;
  level: ChainKnowledgeLevel;
  confidence: number | null;
  rationale: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type BuyerContactRow = {
  id: string;
  organization_id: string;
  discovered_project_id: string;
  chain_node_id: string | null;
  contact_id: string | null;
  full_name: string | null;
  job_title: string | null;
  company_name: string | null;
  email: string | null;
  linkedin_url: string | null;
  buyer_role: string | null;
  priority: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export const CHAIN_ROLE_LABELS: Record<ChainRole, string> = {
  owner: "Owner / operator",
  developer: "Developer",
  epc: "EPC contractor",
  gc: "General contractor",
  mep: "MEP contractor",
  electrical: "Electrical contractor",
  intermediary: "Labor intermediary",
  other: "Other",
};

export const CHAIN_ROLE_ORDER: Record<ChainRole, number> = {
  owner: 0,
  developer: 1,
  epc: 2,
  gc: 3,
  mep: 4,
  electrical: 5,
  intermediary: 6,
  other: 7,
};
