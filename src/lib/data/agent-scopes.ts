// Client-safe: what a badge can be allowed to do, in words a manager can
// judge. Scope names are the contract with the API; these descriptions are
// how someone decides whether to grant one.
//
// Deliberately small. Every scope here is a thing an agent can do without a
// human in the loop, so the list should stay short enough to read.

export interface ScopeSpec {
  value: string;
  label: string;
  description: string;
  /** Roles that normally carry it, for the hire form's presets. */
  suggestedFor: string[];
}

export const AGENT_SCOPES: ScopeSpec[] = [
  {
    value: "research.read",
    label: "Read project research",
    description:
      "Look at projects, contractor chains and buyer contacts. Read-only — cannot change anything.",
    suggestedFor: ["scout"],
  },
  {
    value: "research.suggestion.create",
    label: "Propose research findings",
    description:
      "File companies, contacts and package opportunities against a project. They land in Approvals; the agent cannot accept its own.",
    suggestedFor: ["scout"],
  },
  {
    value: "job_intake.ingest",
    label: "Read the job inbox",
    description:
      "Forward recruiter email into Triangle for scoring. Cannot send mail, only bring it in.",
    suggestedFor: ["inbox"],
  },
  {
    value: "worker.propose",
    label: "Read CVs and propose people",
    description:
      "Read uploaded CVs and enrich the proposed profile. Cannot add anyone to the Talent Pool — a human accepts in Approvals.",
    suggestedFor: ["hr"],
  },
];

export const SCOPE_BY_VALUE = new Map(AGENT_SCOPES.map((s) => [s.value, s]));

/** Ready-made jobs, so hiring does not start with a blank form. */
export const ROLE_PRESETS: Array<{
  key: string;
  displayName: string;
  roleTitle: string;
  emoji: string;
  scopes: string[];
  description: string;
}> = [
  {
    key: "hr",
    displayName: "Hanna",
    roleTitle: "Resourcing · reads CVs and keeps the pool current",
    emoji: "👤",
    scopes: ["worker.propose"],
    description:
      "Reads CVs you upload and works out the trade, skills and real certificates behind them.",
  },
  {
    key: "scout",
    displayName: "Scout",
    roleTitle: "Business Development · project researcher",
    emoji: "🔍",
    scopes: ["research.read", "research.suggestion.create"],
    description:
      "Searches the market for projects and contracts that fit your available crews.",
  },
  {
    key: "inbox",
    displayName: "Bob",
    roleTitle: "Operations · inbox coordinator",
    emoji: "📥",
    scopes: ["job_intake.ingest"],
    description: "Reads recruiter mail each morning and files new job opportunities.",
  },
];
