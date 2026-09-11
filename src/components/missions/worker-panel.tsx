"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowUp,
  Check,
  ChevronRight,
  CircleDot,
  FileSearch,
  Flag,
  Gauge,
  Globe,
  Loader2,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import {
  ago,
  type ActivityEvent,
  type ActivityKind,
  type MissionMessage,
  type MissionState,
  type MissionStepView,
  type MissionWorkspace,
} from "@/lib/data/mission-shared";
import { StateChip } from "@/components/missions/mission-state";

// ---------------------------------------------------------------------------
// The worker, beside the work.
//
// "The right side is the active worker; the left is the worker's actual
// output." A conversation that reads top to bottom: what you asked, what the
// worker did about it — searches, pages, what it filed — and what it said.
// While a step runs, its activity arrives here as it happens.
//
// Activity, not thinking. Every line is something that happened: a search the
// provider ran, a page it read, a record it wrote, a thing it could not find.
// ---------------------------------------------------------------------------

const RUNNING: MissionState[] = ["queued", "working"];

const ICON: Record<ActivityKind, { Icon: typeof Search; tone: string }> = {
  started: { Icon: ChevronRight, tone: "text-slate-400" },
  planned: { Icon: Flag, tone: "text-sky-600" },
  progress: { Icon: Gauge, tone: "text-sky-600" },
  searched: { Icon: Search, tone: "text-slate-400" },
  opened: { Icon: Globe, tone: "text-slate-400" },
  looked: { Icon: FileSearch, tone: "text-slate-400" },
  read: { Icon: FileSearch, tone: "text-slate-400" },
  found: { Icon: Check, tone: "text-emerald-600" },
  missing: { Icon: CircleDot, tone: "text-amber-500" },
  dead: { Icon: X, tone: "text-rose-400" },
  dropped: { Icon: X, tone: "text-slate-400" },
  asked: { Icon: AlertTriangle, tone: "text-amber-500" },
  finished: { Icon: Check, tone: "text-slate-900" },
  failed: { Icon: AlertTriangle, tone: "text-rose-500" },
  refused: { Icon: AlertTriangle, tone: "text-rose-500" },
};

function elapsed(since: string | null, now: number): string {
  if (!since) return "";
  const s = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function WorkerPanel({
  workspace,
  canWrite,
}: {
  workspace: MissionWorkspace;
  canWrite: boolean;
}) {
  const router = useRouter();
  const { mission, lead, steps, messages, latest } = workspace;
  const name = lead?.name ?? "The worker";

  const [state, setState] = useState<MissionState>(workspace.state);
  const [reason, setReason] = useState<string | null>(workspace.stateReason);
  const [live, setLive] = useState<ActivityEvent[]>([]);
  const [since, setSince] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const stateRef = useRef(state);
  const scroller = useRef<HTMLDivElement>(null);

  // What the server says wins whenever the page re-renders with something new.
  // Adjusted during render rather than in an effect, so the panel never paints
  // a frame of the old state first.
  const serverKey = `${workspace.state}|${workspace.stateReason ?? ""}|${steps.length}`;
  const [lastServerKey, setLastServerKey] = useState(serverKey);
  if (serverKey !== lastServerKey) {
    setLastServerKey(serverKey);
    setState(workspace.state);
    setReason(workspace.stateReason);
    setPending(null);
  }
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const running = RUNNING.includes(state) || pending !== null;

  // While a step runs: its activity every few seconds, and the whole page
  // again the moment it finishes.
  useEffect(() => {
    if (!running) return;
    let alive = true;
    let updatedAt = mission.updatedAt;
    const tick = async () => {
      try {
        const res = await fetch(`/api/missions/${mission.id}/pulse`, { cache: "no-store" });
        if (!res.ok || !alive) return;
        const pulse = (await res.json()) as {
          state: MissionState;
          reason: string | null;
          activity: ActivityEvent[];
          runningSince: string | null;
          updatedAt: string;
        };
        setLive(pulse.activity ?? []);
        setSince(pulse.runningSince);
        setReason(pulse.reason);
        const changed = pulse.state !== stateRef.current || pulse.updatedAt !== updatedAt;
        updatedAt = pulse.updatedAt;
        if (pulse.state !== stateRef.current) {
          stateRef.current = pulse.state;
          setState(pulse.state);
        }
        if (changed && !RUNNING.includes(pulse.state)) router.refresh();
      } catch {
        // The next tick tries again.
      }
    };
    void tick();
    const poll = window.setInterval(() => void tick(), 2500);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [running, mission.id, mission.updatedAt, router]);

  // Looking at a finished mission is what turns "ready" into "done".
  useEffect(() => {
    if (workspace.state !== "ready") return;
    void fetch(`/api/missions/${mission.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "seen" }),
    }).catch(() => {});
  }, [mission.id, workspace.state]);

  const ordered = useMemo(() => [...steps].reverse(), [steps]);
  const byStep = useMemo(() => {
    const map = new Map<string, MissionMessage[]>();
    for (const m of messages) {
      const list = map.get(m.stepId) ?? [];
      list.push(m);
      map.set(m.stepId, list);
    }
    return map;
  }, [messages]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [steps.length, messages.length, pending, live.length]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || sending || !canWrite) return;
    setSending(true);
    setError(null);
    setPending(question);
    setDraft("");
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, missionId: mission.id }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? `That did not reach ${name}.`);
        setPending(null);
        setDraft(question);
        return;
      }
      stateRef.current = "queued";
      setState("queued");
      router.refresh();
    } catch {
      setError("Network error.");
      setPending(null);
      setDraft(question);
    } finally {
      setSending(false);
    }
  }

  async function retry() {
    setRetrying(true);
    setError(null);
    try {
      const res = await fetch(`/api/missions/${mission.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry" }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not try again.");
        return;
      }
      stateRef.current = "queued";
      setState("queued");
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setRetrying(false);
    }
  }

  const current = steps[0];
  const suggestions = !running && latest && state !== "blocked" ? latest.suggestedNext : [];

  return (
    <section className="flex h-full min-h-[520px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <header className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-[16px]">
          {lead?.emoji ?? "🤖"}
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-slate-900">{name}</p>
          <p className="truncate text-[11px] text-slate-500">{lead?.role ?? "Employee"}</p>
        </div>
        <span className="grow" />
        <StateChip state={state} size="sm" />
      </header>

      <div ref={scroller} className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {ordered.map((step) => (
          <StepBlock
            key={step.id}
            step={step}
            messages={byStep.get(step.id) ?? []}
            name={name}
            live={running && step.id === current?.id && step.status !== "completed" ? live : null}
            clock={step.id === current?.id ? elapsed(since, now) : ""}
            isLatest={step.id === current?.id}
          />
        ))}

        {pending && (
          <div className="space-y-2">
            <HumanBubble text={pending} at={null} />
            <p className="flex items-center gap-2 pl-1 text-[12px] text-slate-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              Handing it to {name}…
            </p>
          </div>
        )}

        {state === "blocked" && reason && !pending && (
          <div className="rounded-xl border border-rose-200 bg-rose-50/70 px-3.5 py-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              Stopped
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-rose-900">{reason}</p>
            {canWrite && (
              <button
                type="button"
                onClick={() => void retry()}
                disabled={retrying}
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[12.5px] font-semibold text-rose-800 ring-1 ring-rose-200 transition hover:bg-rose-100 disabled:opacity-50"
              >
                {retrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                Try again
              </button>
            )}
          </div>
        )}

        {suggestions.length > 0 && canWrite && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              {state === "needs_you" ? "Or tell it to" : "Next, you could"}
            </p>
            <div className="mt-2 flex flex-col gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  title={s.instruction}
                  onClick={() => void send(s.instruction)}
                  className="group flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-[13px] font-medium text-slate-800 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-700" />
                  <span className="min-w-0">
                    {s.label}
                    <span className="block truncate text-[11.5px] font-normal text-slate-500">
                      {s.instruction}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
        className="border-t border-slate-100 p-3"
      >
        <div className="rounded-xl border border-slate-200 bg-white transition focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-900/5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(draft);
              }
            }}
            rows={2}
            disabled={!canWrite}
            placeholder={
              !canWrite
                ? "Your role can read this mission but not instruct it."
                : state === "needs_you"
                  ? `Answer ${name}…`
                  : `Tell ${name} what to do next…`
            }
            className="block max-h-40 min-h-[56px] w-full resize-none rounded-xl bg-transparent px-3 py-2.5 text-[13px] leading-relaxed text-slate-900 placeholder-slate-400 focus:outline-none disabled:cursor-not-allowed"
          />
          <div className="flex items-center gap-2 px-2 pb-2">
            <span className="truncate pl-1 text-[11px] text-slate-400">
              {running
                ? `${name} reads this after the current step`
                : "Enter to send · Shift+Enter for a new line"}
            </span>
            <span className="grow" />
            <button
              type="submit"
              aria-label="Send"
              disabled={!draft.trim() || sending || !canWrite}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-slate-800 disabled:opacity-30"
            >
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </button>
          </div>
        </div>
        {error && <p className="mt-2 text-[12px] text-rose-600">{error}</p>}
      </form>
    </section>
  );
}

function HumanBubble({ text, at }: { text: string; at: string | null }) {
  return (
    <div className="flex flex-col items-end">
      <p className="ml-8 whitespace-pre-line rounded-2xl rounded-br-md bg-slate-900 px-3.5 py-2.5 text-[13px] leading-relaxed text-white">
        {text}
      </p>
      {at && <span className="mt-1 pr-1 text-[10.5px] text-slate-400">{ago(at)}</span>}
    </div>
  );
}

function StepBlock({
  step,
  messages,
  name,
  live,
  clock,
  isLatest,
}: {
  step: MissionStepView;
  messages: MissionMessage[];
  name: string;
  live: ActivityEvent[] | null;
  clock: string;
  isLatest: boolean;
}) {
  const instruction = messages.find((m) => m.role === "human")?.body ?? step.instruction;
  const replies = messages.filter((m) => m.role === "agent");
  const events = live ?? step.activity;
  const question = isLatest ? step.record?.questionForCeo : null;

  return (
    <div className="space-y-2">
      <HumanBubble text={instruction} at={step.createdAt} />

      {live ? (
        <div className="rounded-xl border border-sky-100 bg-sky-50/50 px-3 py-2.5">
          <p className="flex items-center gap-2 text-[12px] font-semibold text-sky-800">
            <Loader2 className="h-3 w-3 animate-spin" />
            {step.status === "queued" ? `Waiting for ${name} to start` : `${name} is working`}
            <span className="grow" />
            <span className="font-mono text-[11px] font-medium tabular-nums text-sky-700">{clock}</span>
          </p>
          {events.length > 0 && <ActivityList events={events.slice(-7)} />}
        </div>
      ) : (
        events.length > 0 && <ActivitySummary events={events} step={step} />
      )}

      {replies.map((m) => (
        <div key={m.id} className="mr-6">
          <p className="mb-1 pl-1 text-[11px] font-medium text-slate-500">{name}</p>
          <p className="whitespace-pre-line rounded-2xl rounded-bl-md bg-slate-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-800 ring-1 ring-slate-200/70">
            {m.body}
          </p>
        </div>
      ))}

      {question && (
        <div className="mr-6 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
          <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-amber-700">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Needs your decision
          </p>
          <p className="mt-1 text-[13px] font-medium leading-relaxed text-amber-950">{question}</p>
        </div>
      )}
    </div>
  );
}

function ActivityList({ events }: { events: ActivityEvent[] }) {
  return (
    <ul className="mt-2 space-y-1">
      {events.map((e, i) => {
        const { Icon, tone } = ICON[e.kind] ?? ICON.started;
        return (
          <li key={`${e.at}-${i}`} className="flex items-start gap-2 text-[12px] leading-snug text-slate-600">
            <Icon className={`mt-[3px] h-3 w-3 shrink-0 ${tone}`} />
            <span className="min-w-0 break-words">{e.text}</span>
          </li>
        );
      })}
    </ul>
  );
}

function ActivitySummary({ events, step }: { events: ActivityEvent[]; step: MissionStepView }) {
  const searches = events.filter((e) => e.kind === "searched").length;
  const pages = events.filter((e) => e.kind === "opened" || e.kind === "looked").length;
  const filed = step.record?.filed;
  const parts = [
    searches ? `${searches} ${searches === 1 ? "search" : "searches"}` : null,
    pages ? `${pages} ${pages === 1 ? "page" : "pages"} read` : null,
    filed && filed.companies > 0
      ? `${filed.companies} filed · ${filed.reachable} to reach`
      : filed && step.record?.candidates
        ? `${filed.people} people named`
        : null,
    step.status === "failed" ? "stopped" : null,
  ].filter(Boolean);

  return (
    <details className="group rounded-xl border border-slate-100 bg-white px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[12px] text-slate-500 transition hover:text-slate-800">
        <ChevronRight className="h-3 w-3 shrink-0 transition group-open:rotate-90" />
        <span className="font-medium text-slate-700">Activity</span>
        <span className="truncate">{parts.join(" · ") || `${events.length} events`}</span>
      </summary>
      <ActivityList events={events} />
    </details>
  );
}
