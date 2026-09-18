// Client-safe: where work on a case actually stands, in words a person can
// act on.
//
// "Conversation · 3" is not a status, and neither is a scroll of everything
// anybody has written. A person opening a case wants one thing first — whose
// move is it — and the honest answer has four shapes: the employee has not
// picked it up, the employee is on it, the employee answered and it is back
// with you, or it was stopped.
//
// Triangle can wake a bot when you post, but that is a pickup request, not a
// delivery. A message nobody has fetched stays "not picked up yet" rather
// than being dressed up as sent.

export type CaseWorkState = "queued" | "working" | "answered" | "stopped";

export function caseWorkState(params: {
  status: string;
  awaitingAgent: number;
}): CaseWorkState {
  if (params.status === "completed") return "answered";
  if (params.status === "cancelled" || params.status === "failed") return "stopped";
  if (params.status === "active") return "working";
  return "queued";
}

export function caseWorkSentence(params: {
  state: CaseWorkState;
  agentName: string;
  awaitingAgent: number;
}): string {
  const who = params.agentName.trim() || "the employee";
  const unread =
    params.awaitingAgent > 0
      ? ` ${params.awaitingAgent} ${params.awaitingAgent === 1 ? "message" : "messages"} not picked up yet.`
      : "";
  switch (params.state) {
    case "queued":
      return `Queued for ${who}. Not picked up yet.${unread}`;
    case "working":
      return `${who} is on it.${unread}`;
    case "answered":
      return `${who} answered. It is back with you.`;
    case "stopped":
      return `Stopped. ${who} is not working on this.`;
  }
}

/** Whose move it is, for the dot beside the sentence. */
export function caseWorkIsYours(state: CaseWorkState): boolean {
  return state === "answered" || state === "stopped";
}
