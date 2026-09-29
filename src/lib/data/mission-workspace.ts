import { parseWorkspace, type Workspace } from "@/lib/data/workspace";
import type { MissionStepView } from "@/lib/data/mission-shared";

// ---------------------------------------------------------------------------
// The answer a mission holds.
//
// A finished step stores its record as JSON, and a step that answered in a
// workspace keeps it there — no new table. The newest one that still reads is
// the mission's answer; an older record, or one written before this existed,
// simply has none, and the mission falls back to its counters.
//
// Validated again on the way out: a workspace that no longer matches the
// vocabulary is not drawn, because a half-drawn answer is worse than none.
// ---------------------------------------------------------------------------

export interface FiledWorkspace {
  workspace: Workspace;
  stepId: string;
  /** The employee who answered, so a person knows who to ask. */
  filedBy: string | null;
  filedAt: string | null;
}

/** Newest first, as the mission view holds them. */
export function latestWorkspaceOf(steps: MissionStepView[]): FiledWorkspace | null {
  for (const step of steps) {
    const raw = step.record?.workspace;
    if (raw === undefined || raw === null) continue;
    const read = parseWorkspace(raw);
    if (!read.ok) continue;
    return {
      workspace: read.workspace,
      stepId: step.id,
      filedBy: step.worker,
      filedAt: step.completedAt ?? step.createdAt,
    };
  }
  return null;
}
