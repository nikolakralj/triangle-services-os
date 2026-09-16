"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { ago } from "@/lib/data/mission-shared";
import type { TeamMember, TeamTask, TeamTaskStatus } from "@/lib/data/team";
import { HouseRules } from "@/components/modules/house-rules";
import { AssignmentThreadDrawer } from "@/components/modules/assignment-thread-drawer";
import type { ThreadTarget } from "@/components/modules/today-handoff-context";

// ---------------------------------------------------------------------------
// Settings → Team. One row per employee: what they own, whether they are awake
// and can be woken, how much they carry, what their badge allows, how they are
// told to work, and what they did lately. Nothing is handed out from here —
// that happens on the case.
// ---------------------------------------------------------------------------

const STATUS: Record<TeamTaskStatus, { label: string; tone: string }> = {
  queued: { label: "Queued", tone: "bg-slate-100 text-slate-700" },
  active: { label: "Working", tone: "bg-sky-100 text-sky-800" },
  waiting_review: { label: "Needs you", tone: "bg-amber-100 text-amber-800" },
  completed: { label: "Done", tone: "bg-emerald-100 text-emerald-800" },
  failed: { label: "Failed", tone: "bg-rose-100 text-rose-800" },
  cancelled: { label: "Taken back", tone: "bg-slate-100 text-slate-500" },
};
const STALE = { label: "Stale", tone: "bg-slate-200 text-slate-600" };

export function TeamSettings({
  members,
  canWriteRules,
}: {
  members: TeamMember[];
  canWriteRules: boolean;
}) {
  const [thread, setThread] = useState<ThreadTarget | null>(null);

  if (members.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-center text-[13px] text-slate-500">
        No AI employees yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[13px] leading-relaxed text-slate-500">
        Work is handed out from the case — Ask, Ask Bob, or an instruction in a mission. This is where
        you see who carries what, and tell each of them how to work.
      </p>
      {members.map((member) => (
        <TeamRow
          key={member.employee.id}
          member={member}
          canWriteRules={canWriteRules}
          onOpenThread={setThread}
        />
      ))}
      <AssignmentThreadDrawer
        key={thread?.assignmentId ?? "closed"}
        thread={thread}
        onClose={() => setThread(null)}
      />
    </div>
  );
}

function TeamRow({
  member,
  canWriteRules,
  onOpenThread,
}: {
  member: TeamMember;
  canWriteRules: boolean;
  onOpenThread: (thread: ThreadTarget) => void;
}) {
  const [showActivity, setShowActivity] = useState(false);
  const { employee, runtime, wakeConfigured, permissions, load, refusalsThisWeek, recent } = member;

  const health = employee.neverStarted
    ? { dot: "bg-slate-300", text: "Never started" }
    : employee.onDuty
      ? { dot: "bg-emerald-500", text: `On duty · seen ${ago(employee.lastUsedAt)}` }
      : { dot: "bg-slate-400", text: `Off duty · seen ${ago(employee.lastUsedAt)}` };

  return (
    <article
      id={`team-${employee.roleKey}`}
      className="scroll-mt-20 rounded-xl border border-slate-200 bg-white p-4"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(200px,1.1fr)_minmax(220px,1fr)_minmax(240px,1.3fr)]">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-[18px]" aria-hidden>
            {employee.emoji}
          </span>
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-slate-900">{employee.displayName}</h3>
            <p className="mt-0.5 text-[12.5px] leading-snug text-slate-500">
              {employee.description ?? employee.department ?? employee.roleKey}
            </p>
          </div>
        </div>

        <dl className="grid content-start gap-1.5 text-[12.5px] text-slate-700">
          <Fact label="Health">
            <span className="inline-flex items-center gap-1.5" suppressHydrationWarning>
              <span className={`h-2 w-2 rounded-full ${health.dot}`} aria-hidden />
              {health.text}
            </span>
          </Fact>
          <Fact label="Runs on">
            {runtime === "bot" ? (
              <span>
                {employee.provider === "grok" || !employee.provider ? "Grok bot" : `${employee.provider} bot`}
                {" · "}
                {wakeConfigured ? (
                  "wake-up set"
                ) : (
                  <span
                    className="font-medium text-amber-700"
                    title="Triangle cannot wake this bot from this server, so new work waits for the bot's own scheduled check."
                  >
                    wake-up not set — waits for its scheduled check
                  </span>
                )}
              </span>
            ) : (
              "Triangle's own runner"
            )}
          </Fact>
          <Fact label="Load">
            {load.working + load.queued + load.stale + load.needsYou + load.failedThisWeek === 0 ? (
              <span className="text-slate-500">nothing in hand</span>
            ) : (
              <span className="flex flex-wrap gap-1">
                {load.working > 0 && <Chip tone="bg-sky-100 text-sky-800">{load.working} working</Chip>}
                {load.queued > 0 && <Chip tone="bg-slate-100 text-slate-700">{load.queued} queued</Chip>}
                {load.stale > 0 && (
                  <Chip tone={STALE.tone} title="Open, but nothing has happened on it for a day.">
                    {load.stale} stale
                  </Chip>
                )}
                {load.needsYou > 0 && <Chip tone="bg-amber-100 text-amber-800">{load.needsYou} needs you</Chip>}
                {load.failedThisWeek > 0 && (
                  <Chip tone="bg-rose-100 text-rose-800">{load.failedThisWeek} failed this week</Chip>
                )}
              </span>
            )}
          </Fact>
          <Fact label="May">
            {permissions.length === 0 ? (
              <span className="text-slate-500">No active badge</span>
            ) : (
              <span>
                {permissions.map((p, i) => (
                  <span key={p.label} title={p.description}>
                    {i > 0 ? " · " : ""}
                    {p.label}
                  </span>
                ))}
              </span>
            )}
          </Fact>
          <Fact label="Refused">
            {refusalsThisWeek === 0 ? (
              <span className="text-slate-500">nothing this week</span>
            ) : (
              <a href="#diagnostics" className="font-medium text-sky-700 hover:text-sky-900">
                {refusalsThisWeek} this week — see Diagnostics
              </a>
            )}
          </Fact>
        </dl>

        <div className="min-w-0">
          <HouseRules
            employeeId={employee.id}
            name={employee.displayName}
            rules={employee.houseRules}
            canEdit={canWriteRules}
          />
          <button
            type="button"
            onClick={() => setShowActivity((v) => !v)}
            aria-expanded={showActivity}
            className="mt-2 text-[12px] font-medium text-sky-700 transition hover:text-sky-900"
          >
            {showActivity ? "Hide activity" : `Activity · ${recent.length} recent`}
          </button>
        </div>
      </div>

      {showActivity && (
        <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
          {recent.length === 0 ? (
            <li className="px-3 py-3 text-[12.5px] text-slate-500">No work recorded yet.</li>
          ) : (
            recent.map((task) => (
              <ActivityRow
                key={task.id}
                task={task}
                agentName={employee.displayName}
                onOpenThread={onOpenThread}
              />
            ))
          )}
        </ul>
      )}
    </article>
  );
}

function ActivityRow({
  task,
  agentName,
  onOpenThread,
}: {
  task: TeamTask;
  agentName: string;
  onOpenThread: (thread: ThreadTarget) => void;
}) {
  const status = task.stale ? STALE : (STATUS[task.status] ?? STATUS.queued);
  const open = task.status === "queued" || task.status === "active" || task.status === "waiting_review";
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1.5 px-3 py-2.5">
      <span className={`mt-0.5 rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${status.tone}`}>
        {status.label}
      </span>
      <div className="min-w-0 flex-1 basis-60">
        <p className="text-[13px] font-medium text-slate-900">{task.title}</p>
        {task.result && <p className="mt-0.5 text-[12px] leading-snug text-slate-600">{task.result}</p>}
        <p className="mt-0.5 text-[11.5px] text-slate-400" suppressHydrationWarning>
          {task.completedAt
            ? `finished ${ago(task.completedAt)}`
            : task.stale
              ? `given ${ago(task.createdAt)} · nothing since ${ago(task.lastActivityAt)}`
              : `given ${ago(task.createdAt)}`}
          {task.missionId && (
            <>
              {" · "}
              <Link href={`/missions/${task.missionId}`} className="text-sky-700 hover:text-sky-900">
                in a mission
              </Link>
            </>
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={() =>
          onOpenThread({
            assignmentId: task.id,
            title: task.title,
            agentName,
            messageCount: task.messageCount,
            awaitingAgent: task.awaitingAgent,
            finished: !open,
          })
        }
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-[12px] font-medium text-slate-700 transition hover:bg-slate-50"
      >
        <MessageSquare className="h-3.5 w-3.5" />
        Thread
      </button>
    </li>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <dt className="w-16 shrink-0 font-mono text-[10.5px] uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

function Chip({ tone, title, children }: { tone: string; title?: string; children: React.ReactNode }) {
  return (
    <span title={title} className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${tone}`}>
      {children}
    </span>
  );
}
