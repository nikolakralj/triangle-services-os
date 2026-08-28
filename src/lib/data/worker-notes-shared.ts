// Client-safe half of worker notes.
//
// The data module is `server-only` and imports next/headers, so anything the
// browser needs — the kinds, their labels, the row shape — has to live apart
// from it. Same split as contractor-chain-shared.ts.

export const NOTE_KINDS = [
  "note",
  "feedback",
  "availability",
  "issue",
  "commercial",
  "document",
] as const;

export type WorkerNoteKind = (typeof NOTE_KINDS)[number];

export const NOTE_KIND_LABEL: Record<WorkerNoteKind, string> = {
  note: "Note",
  feedback: "Client feedback",
  availability: "Availability",
  issue: "Issue",
  commercial: "Rate / commercial",
  document: "Document",
};

export interface WorkerNote {
  id: string;
  kind: WorkerNoteKind;
  body: string;
  occurredOn: string;
  authorName: string | null;
  createdAt: string;
}
