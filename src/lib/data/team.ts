import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { listWorkforce, type WorkforceEmployee } from "@/lib/data/workforce";
import { countMessagesByAssignment } from "@/lib/data/assignment-threads";
import { employeeRuntimeOf, wakeEnvNames, type MissionRuntime } from "@/lib/data/bot-runtime";
import { SCOPE_BY_VALUE } from "@/lib/data/agent-scopes";
import { parseActivity } from "@/lib/data/mission-shared";

// ---------------------------------------------------------------------------
// Settings → Team: the employees as an admin sees them.
//
// Not a console. Work is handed out from the case — Ask, Ask Bob, a mission —
// and managed here: who owns what, whether they are awake and can be woken,
// how much they carry, what their badge lets them do, how they are told to
// work, and what they did lately. The operating-shell decision (16 September)
// moved this out of the menu; Linear and Microsoft Agent 365 keep agents in
// admin the same way.
// ---------------------------------------------------------------------------

export type TeamTaskStatus =
  | "queued"
  | "active"
  | "waiting_review"
  | "completed"
  | "failed"
  | "cancelled";

export interface TeamTask {
  id: string;
  title: string;
  status: TeamTaskStatus;
  /** Open, but nothing has happened on it for a day: no pickup, message or run activity. */
  stale: boolean;
  /** The newest sign of life: created, picked up, a thread message, or run activity. */
  lastActivityAt: string;
  createdAt: string;
  completedAt: string | null;
  missionId: string | null;
  /** One line of what came back, when something did. */
  result: string | null;
  messageCount: number;
  awaitingAgent: number;
}

export interface TeamMember {
  employee: WorkforceEmployee;
  runtime: MissionRuntime;
  /** Both the wake-up URL and key are set for this role. Only meaningful for bots. */
  wakeConfigured: boolean;
  permissions: Array<{ label: string; description: string }>;
  /** Queued and working count only fresh work; quiet open work counts as stale instead. */
  load: { queued: number; working: number; stale: number; needsYou: number; failedThisWeek: number };
  refusalsThisWeek: number;
  recent: TeamTask[];
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** Linear's agent sessions go stale when an agent stops responding; a working day is our line. */
const STALE_MS = 24 * 60 * 60 * 1000;
const RECENT_PER_EMPLOYEE = 12;

/** Postgres and the activity log write timestamps differently; compare instants, not strings. */
const newest = (a: string, b: string | null | undefined) =>
  b && (!a || Date.parse(b) > Date.parse(a)) ? b : a;

/** A finished step stores JSON with a reply; older work stores prose. One line either way. */
function resultLine(summary: string | null): string | null {
  const text = summary?.trim();
  if (!text) return null;
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as { reply?: unknown; brief?: { headline?: unknown } };
      const line =
        (typeof parsed.brief?.headline === "string" && parsed.brief.headline.trim()) ||
        (typeof parsed.reply === "string" && parsed.reply.trim()) ||
        "";
      return line ? line.slice(0, 220) : null;
    } catch {
      return null;
    }
  }
  return text.replace(/\s+/g, " ").slice(0, 220);
}

export async function listTeam(orgId: string): Promise<TeamMember[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];

  const employees = await listWorkforce(orgId);
  if (employees.length === 0) return [];
  const ids = employees.map((e) => e.id);
  const weekAgo = new Date(Date.now() - WEEK_MS).toISOString();

  const [instancesRes, credsRes, tasksRes, refusalsRes] = await Promise.all([
    svc.from("agent_instances").select("id, role_key, config").eq("org_id", orgId).in("id", ids),
    svc
      .from("machine_credentials")
      .select("agent_instance_id, scopes")
      .eq("org_id", orgId)
      .eq("status", "active")
      .in("agent_instance_id", ids),
    svc
      .from("agent_assignments")
      .select("id, agent_instance_id, title, status, created_at, started_at, completed_at, mission_id, result_summary, constraints")
      .eq("org_id", orgId)
      .in("agent_instance_id", ids)
      .order("created_at", { ascending: false })
      .limit(400),
    svc
      .from("refusal_log")
      .select("attempted_by_agent")
      .eq("org_id", orgId)
      .gte("occurred_at", weekAgo)
      .not("attempted_by_agent", "is", null)
      .limit(500),
  ]);

  const configById = new Map(
    (instancesRes.data ?? []).map((i) => [
      i.id as string,
      (i.config as Record<string, unknown> | null) ?? null,
    ]),
  );
  const scopesById = new Map<string, string[]>();
  for (const c of credsRes.data ?? []) {
    const id = c.agent_instance_id as string;
    const list = scopesById.get(id) ?? [];
    for (const s of (c.scopes as string[] | null) ?? []) if (!list.includes(s)) list.push(s);
    scopesById.set(id, list);
  }
  const refusalsByName = new Map<string, number>();
  for (const r of refusalsRes.data ?? []) {
    const name = String(r.attempted_by_agent).trim().toLowerCase();
    refusalsByName.set(name, (refusalsByName.get(name) ?? 0) + 1);
  }

  // Wake-up machinery (event outbox) is not work the employee chose or was given.
  const tasks = (tasksRes.data ?? []).filter((t) => {
    const constraints = (t.constraints as Record<string, unknown> | null) ?? {};
    return String(constraints.case_type ?? "") !== "event_outbox";
  });
  // Activity: everything still open, then the latest finished work, twelve rows at least.
  const isOpen = (status: unknown) => status === "queued" || status === "active" || status === "waiting_review";
  const recentIds: string[] = [];
  const recentByEmployee = new Map<string, typeof tasks>();
  for (const pass of [true, false]) {
    for (const t of tasks) {
      if (isOpen(t.status) !== pass) continue;
      const id = t.agent_instance_id as string;
      const list = recentByEmployee.get(id) ?? [];
      if (pass || list.length < RECENT_PER_EMPLOYEE) {
        list.push(t);
        recentIds.push(t.id as string);
      }
      recentByEmployee.set(id, list);
    }
  }
  // An open task's last sign of life. Waiting on a person is not stale — that is Needs you.
  const openIds = tasks
    .filter((t) => t.status === "queued" || t.status === "active")
    .map((t) => t.id as string);
  const [threads, messagesRes, runsRes] = await Promise.all([
    countMessagesByAssignment(recentIds, orgId),
    openIds.length
      ? svc.from("assignment_messages").select("assignment_id, created_at").eq("org_id", orgId).in("assignment_id", openIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    openIds.length
      ? svc
          .from("agent_runs")
          .select("assignment_id, started_at, finished_at, created_at, metadata")
          .eq("org_id", orgId)
          .in("assignment_id", openIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ]);
  const lastSeen = new Map<string, string>();
  const touch = (id: unknown, at: unknown) => {
    if (typeof id !== "string" || typeof at !== "string") return;
    lastSeen.set(id, newest(lastSeen.get(id) ?? "", at));
  };
  for (const m of messagesRes.data ?? []) touch(m.assignment_id, m.created_at);
  for (const r of runsRes.data ?? []) {
    touch(r.assignment_id, r.created_at);
    touch(r.assignment_id, r.started_at);
    touch(r.assignment_id, r.finished_at);
    for (const e of parseActivity(r.metadata)) touch(r.assignment_id, e.at);
  }
  const staleBefore = Date.now() - STALE_MS;
  const lifeOf = (t: (typeof tasks)[number]) => {
    const at = newest(
      newest(t.created_at as string, t.started_at as string | null),
      lastSeen.get(t.id as string),
    );
    const open = t.status === "queued" || t.status === "active";
    return { at, stale: open && Date.parse(at) < staleBefore };
  };

  return employees.map((employee) => {
    const mine = tasks
      .filter((t) => t.agent_instance_id === employee.id)
      .map((t) => ({ t, life: lifeOf(t) }));
    const runtime = employeeRuntimeOf(employee.roleKey, configById.get(employee.id) ?? null);
    const env = wakeEnvNames(employee.roleKey);
    return {
      employee,
      runtime,
      wakeConfigured: Boolean(process.env[env.url] && process.env[env.key]),
      permissions: (scopesById.get(employee.id) ?? []).map((value) => {
        const spec = SCOPE_BY_VALUE.get(value);
        return spec
          ? { label: spec.label, description: spec.description }
          : { label: value, description: "A scope Triangle does not describe yet." };
      }),
      load: {
        queued: mine.filter(({ t, life }) => t.status === "queued" && !life.stale).length,
        working: mine.filter(({ t, life }) => t.status === "active" && !life.stale).length,
        stale: mine.filter(({ life }) => life.stale).length,
        needsYou: mine.filter(({ t }) => t.status === "waiting_review").length,
        failedThisWeek: mine.filter(
          ({ t }) => t.status === "failed" && (t.created_at as string) >= weekAgo,
        ).length,
      },
      refusalsThisWeek: refusalsByName.get(employee.displayName.trim().toLowerCase()) ?? 0,
      recent: (recentByEmployee.get(employee.id) ?? []).map((t) => {
        const thread = threads.get(t.id as string);
        const life = lifeOf(t);
        return {
          id: t.id as string,
          title: (t.title as string) || "Untitled work",
          status: t.status as TeamTaskStatus,
          stale: life.stale,
          lastActivityAt: life.at,
          createdAt: t.created_at as string,
          completedAt: (t.completed_at as string | null) ?? null,
          missionId: (t.mission_id as string | null) ?? null,
          result: resultLine((t.result_summary as string | null) ?? null),
          messageCount: thread?.total ?? 0,
          awaitingAgent: thread?.awaitingAgent ?? 0,
        };
      }),
    };
  });
}
