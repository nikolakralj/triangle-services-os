import {
  headcountSum,
  requirementCaseTitle,
  requirementPlace,
  type RequirementRoleRow,
} from "@/lib/job-intake/requirement-case";
import { parseWorkspace, type Workspace } from "@/lib/data/workspace";

// ---------------------------------------------------------------------------
// One case, drawn from the workspace blocks.
//
// What was asked, the roles (needed, proposed, missing), the drafts, and the
// questions nobody has answered become one workspace. Triangle draws it with
// the same blocks a filed answer uses. Nothing here sends, and nothing here
// chooses an employee ("The plan", "The workspace is the answer", 29 September).
// ---------------------------------------------------------------------------

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export interface CaseRoleInput extends RequirementRoleRow {
  /** People the team has already named for this role. Empty means nobody yet. */
  proposed: string[];
}

export interface CaseDraftInput {
  subject: string;
  body: string;
  /** The words as Triangle wrote them, when the person has not edited them. */
  original: string | null;
}

export interface CaseActivityInput {
  when: string;
  who: string;
  sentence: string;
}

export interface CaseEmailInput {
  subject: string;
  body: string | null;
  when: string | null;
}

export interface CasePageInput {
  clientName: string | null;
  city: string | null;
  sector: string | null;
  email: CaseEmailInput | null;
  roles: CaseRoleInput[];
  openQuestions: string[];
  drafts: CaseDraftInput[];
  activity: CaseActivityInput[];
}

export interface CaseProposal {
  name: string;
  /** The role the employee named, when they named one. */
  roleTitle: string | null;
}

export interface CaseLetter {
  subject: string;
  body: string;
  original: string;
}

export interface CasePageModel {
  title: string;
  askedBy: string;
  place: string | null;
  asked: string;
  email: CaseEmailInput | null;
  workspace: Workspace;
  drafts: CaseLetter[];
  activity: CaseActivityInput[];
}

/** Which role a reported person belongs on. Null when the report did not say. */
export function matchProposalRole(
  roles: Array<{ title: string; level: string | null }>,
  roleTitle: string | null,
): number | null {
  const wanted = (roleTitle ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!wanted) return roles.length === 1 ? 0 : null;

  const strong: number[] = [];
  for (let i = 0; i < roles.length; i++) {
    const level = (roles[i].level ?? "").trim().toLowerCase();
    const title = roles[i].title.trim().toLowerCase();
    if (!level || !mentions(wanted, level)) continue;
    if (!title || mentions(wanted, title) || wanted === level) strong.push(i);
  }
  if (strong.length === 1) return strong[0];

  const levelOnly = roles
    .map((role, index) => ({ index, level: (role.level ?? "").trim().toLowerCase() }))
    .filter((row) => row.level && wanted === row.level);
  if (levelOnly.length === 1) return levelOnly[0].index;

  const titleHits = roles
    .map((role, index) => ({ index, title: role.title.trim().toLowerCase() }))
    .filter((row) => row.title && (wanted === row.title || mentions(wanted, row.title)));
  if (titleHits.length === 1) return titleHits[0].index;
  return null;
}

/** Names per role, in the order the roles are given. A person is named once. */
export function assignProposals(
  roles: Array<{ title: string; level: string | null }>,
  proposals: CaseProposal[],
): string[][] {
  const buckets = roles.map(() => [] as string[]);
  for (const proposal of proposals) {
    const name = show(proposal.name, 80);
    if (!name) continue;
    const index = matchProposalRole(roles, proposal.roleTitle);
    if (index === null) continue;
    const bucket = buckets[index];
    if (bucket.some((existing) => existing.toLowerCase() === name.toLowerCase())) continue;
    bucket.push(name);
  }
  return buckets;
}

export function buildCasePage(
  input: CasePageInput,
): { ok: true; model: CasePageModel } | { ok: false; errors: string[] } {
  if (input.roles.length === 0) {
    return { ok: false, errors: ["A case needs at least one role."] };
  }

  const place = requirementPlace({ city: input.city, sector: input.sector });
  const askedBy = show(input.clientName ?? "", 80) || "The client";
  const title = requirementCaseTitle({
    who: askedBy === "The client" ? null : askedBy,
    place,
    roles: input.roles,
  });
  const asked = askedSentence(input.roles, place);
  const letters = lettersOf(input.drafts);
  const questions = input.openQuestions.map(questionSentence).filter((q): q is string => Boolean(q));
  const activity = input.activity
    .map((line) => ({
      when: show(line.when, 40) || "Undated",
      who: show(line.who, 40) || "The team",
      sentence: show(line.sentence, 240) || "",
    }))
    .filter((line) => line.sentence.length > 0);

  const blocks: unknown[] = [rolesTable(input.roles)];
  if (letters.length > 0) blocks.push(draftsList(letters));
  if (questions.length > 0) blocks.push(questionsBlock(questions.slice(0, 6)));

  const notEstablished = [
    ...questions.map((q) => q),
    ...input.roles
      .filter((role) => role.proposed.length === 0)
      .map((role) => `Who we propose for ${roleLabel(role).text}`),
    ...(letters.length === 0 ? ["The reply"] : []),
  ]
    .map((line) => show(line, 200))
    .filter((line): line is string => Boolean(line))
    .slice(0, 5);

  const workspaceInput = {
    shape: "shortlist",
    title: show(title, 80) || "A people request",
    question: show(asked, 240) || "What was asked is not established.",
    answer: {
      verdict: verdict({
        roles: input.roles,
        place,
        drafted: letters.length > 0,
        questions,
      }),
      confidence: confidence(input.roles, letters.length > 0, questions.length > 0),
      notEstablished,
    },
    blocks,
    doneWhen: [
      { kind: "rows_at_least", block: "roles", count: input.roles.length },
      { kind: "every_row_has", block: "roles", column: "proposed" },
    ],
    sources: [],
    sensitive: false,
    version: 1,
  };

  const parsed = parseWorkspace(workspaceInput);
  if (!parsed.ok) return parsed;

  return {
    ok: true,
    model: {
      title: parsed.workspace.title,
      askedBy,
      place,
      asked,
      email: input.email
        ? {
            subject: show(input.email.subject, 200) || "Source email",
            body: input.email.body ? prose(input.email.body, 8000) : null,
            when: input.email.when ? show(input.email.when, 40) : null,
          }
        : null,
      workspace: parsed.workspace,
      drafts: letters,
      activity,
    },
  };
}

function askedSentence(roles: RequirementRoleRow[], place: string | null): string {
  const people = headcountSum(roles);
  const kinds = roles
    .map((role) => `${role.headcount} ${show(role.level || role.title, 40) || "people"}`)
    .join(", ");
  const where = place ? ` for ${place}` : "";
  const start = roles.map((role) => role.startText).find((value) => Boolean(value && value.trim()));
  const languages = [
    ...new Set(roles.flatMap((role) => role.languages.map((language) => language.trim()).filter(Boolean))),
  ];
  const bits = [
    `${people} ${people === 1 ? "person" : "people"}${where}: ${kinds}.`,
    start ? `Start ${start}.` : null,
    languages.length > 0 ? languages.join(", ") + "." : null,
  ].filter((bit): bit is string => Boolean(bit));
  return show(bits.join(" "), 240) || "What was asked is not established.";
}

function verdict(input: {
  roles: CaseRoleInput[];
  place: string | null;
  drafted: boolean;
  questions: string[];
}): string {
  const people = headcountSum(input.roles);
  const open = input.roles.filter((role) => role.proposed.length === 0).length;
  const bits = [
    `${people} ${people === 1 ? "person" : "people"}${input.place ? ` for ${input.place}` : ""}.`,
    open === 0
      ? "Someone is proposed for every role."
      : open === input.roles.length
        ? "Nobody is proposed yet."
        : `${open} ${open === 1 ? "role still has" : "roles still have"} nobody proposed.`,
    input.drafted ? "The reply is drafted." : "The reply is not drafted yet.",
    input.questions.length > 0 ? `Still open: ${input.questions.join("; ")}.` : null,
  ].filter((bit): bit is string => Boolean(bit));
  return show(bits.join(" "), 240) || "The case is open.";
}

function confidence(
  roles: CaseRoleInput[],
  drafted: boolean,
  questionsOpen: boolean,
): "solid" | "partial" | "thin" {
  const proposed = roles.filter((role) => role.proposed.length > 0).length;
  if (proposed === roles.length && drafted && !questionsOpen) return "solid";
  if (proposed === 0 && !drafted) return "thin";
  return "partial";
}

function rolesTable(roles: CaseRoleInput[]) {
  return {
    kind: "table",
    id: "roles",
    caption: "Roles",
    columns: [
      { key: "role", label: "Role" },
      { key: "needed", label: "Needed" },
      { key: "proposed", label: "Proposed" },
      { key: "missing", label: "Missing" },
    ],
    rows: roles.map((role) => {
      const label = roleLabel(role);
      const names = nameList(role.proposed);
      const missing = Math.max(0, role.headcount - role.proposed.length);
      return {
        cells: {
          role: {
            text: label.text,
            basis: "our_record",
            ...(label.note ? { note: label.note } : {}),
          },
          needed: { number: role.headcount, unit: "people", basis: "our_record" },
          proposed: names
            ? { text: names, basis: "our_record" as const }
            : { basis: "unknown" as const, note: "Nobody proposed for this role yet." },
          missing: { number: missing, unit: "people", basis: "our_record" },
        },
      };
    }),
  };
}

function draftsList(letters: CaseLetter[]) {
  return {
    kind: "list",
    id: "drafts",
    caption: "Drafts to approve",
    items: letters.map((letter, index) => ({
      title: uniqueTitle(letter.subject, index, letters),
      subtitle: "Ready to send",
      why: show(letter.body, 200) || undefined,
      gaps: [],
      basis: "our_record",
    })),
  };
}

function questionsBlock(questions: string[]) {
  return {
    kind: "gaps",
    id: "questions",
    items: questions.map((missing) => ({
      missing,
      nextStep: "Ask it in the reply. A person sends.",
    })),
  };
}

function lettersOf(drafts: CaseDraftInput[]): CaseLetter[] {
  const letters: CaseLetter[] = [];
  for (const draft of drafts) {
    const body = prose(draft.body, 4000);
    if (!body) continue;
    const subject = show(draft.subject, 80) || "Reply";
    const original = prose(draft.original ?? draft.body, 4000) || body;
    letters.push({ subject, body, original });
  }
  return letters.slice(0, 10);
}

function uniqueTitle(subject: string, index: number, letters: CaseLetter[]): string {
  const same = letters.slice(0, index).filter((letter) => letter.subject === subject).length;
  if (same === 0) return subject;
  const suffix = ` (${same + 1})`;
  return show(subject.slice(0, 80 - suffix.length) + suffix, 80) || `Reply ${same + 1}`;
}

function roleLabel(role: CaseRoleInput): { text: string; note?: string } {
  const head = [show(role.title, 60), role.level ? show(role.level, 40) : null]
    .filter((part): part is string => Boolean(part))
    .join(", ");
  const extra = [
    role.skills.length > 0 ? role.skills.join(", ") : null,
    role.startText ? `from ${role.startText}` : null,
    role.location,
    role.languages.length > 0 ? role.languages.join(", ") : null,
    role.durationText,
  ]
    .map((part) => (part ? show(part, 80) : null))
    .filter((part): part is string => Boolean(part));
  let text = head || "Role";
  const notes: string[] = [];
  for (const bit of extra) {
    const next = `${text}. ${bit}`;
    if (next.length <= 120) text = next;
    else notes.push(bit);
  }
  const note = notes.join(". ");
  return { text, note: note ? show(note, 200) || undefined : undefined };
}

function nameList(names: string[]): string | null {
  const clean = names.map((name) => show(name, 40)).filter((name): name is string => Boolean(name));
  if (clean.length === 0) return null;
  const kept: string[] = [];
  for (const name of clean) {
    const next = [...kept, name].join(", ");
    if (next.length <= 120) kept.push(name);
    else break;
  }
  if (kept.length === 0) return show(clean[0], 120);
  if (kept.length < clean.length) {
    const more = ` and ${clean.length - kept.length} more`;
    const base = kept.join(", ");
    if ((base + more).length <= 120) return base + more;
  }
  return kept.join(", ");
}

function questionSentence(value: string): string | null {
  const text = show(value, 110);
  if (!text) return null;
  if (text.length < 48 && !/[.?!]$/.test(text)) {
    const sentence = text.charAt(0).toUpperCase() + text.slice(1);
    return sentence.toLowerCase().startsWith("the ") ? sentence : `The ${text}`;
  }
  return text;
}

function mentions(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\b)${escaped}(?:\\b|$)`, "i").test(haystack);
}

/** A letter or an email: keep the paragraphs, drop ids and markup. */
function prose(value: string, max: number): string | null {
  const text = value
    .replace(UUID, " ")
    .replace(/[<>*`]/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) return null;
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/** Plain words a person can read. Ids and markup never reach the case. */
function show(value: string, max: number): string | null {
  const text = value
    .replace(UUID, " ")
    .replace(/[<>*`]/g, " ")
    .replace(/\*\*/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1).trimEnd();
  return `${cut}…`;
}
