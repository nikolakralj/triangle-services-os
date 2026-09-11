"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  BadgeCheck,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Link2,
  Loader2,
  Mail,
  Phone,
  ShieldCheck,
  Undo2,
  UserRound,
  X,
} from "lucide-react";
import {
  AUTONOMY_STANDARD,
  ago,
  hostOf,
  type MissionAttempt,
  type MissionCandidate,
  type MissionChannel,
  type MissionCompanyRow,
  type MissionPartner,
  type MissionPersonRow,
  type MissionProjectRow,
  type MissionSourceRow,
  type MissionWorkspace,
} from "@/lib/data/mission-shared";
import {
  outcomeSentence,
  outcomesFor,
  telHref,
  type ContactOutcome,
} from "@/lib/data/contact-channels";
import { MissionTabs } from "@/components/missions/mission-tabs";
import { MissionMark, StateChip } from "@/components/missions/mission-state";
import { WorkerPanel } from "@/components/missions/worker-panel";
import { FinishLine } from "@/components/missions/finish-line";

// ---------------------------------------------------------------------------
// A mission.
//
//   tabs      one per objective, with the worker's state on each
//   header    what it is for, who is on it, where it stands
//   left      the worker's actual output — the brief first, then the records
//   right     the worker itself: the conversation, what it did, what's next
//
// "You are the CEO. You shouldn't have to inspect 31 rows to understand what
// happened." So the brief comes first, with the counts drawn rather than
// written, and the recommended first move set apart. The rows are the binder
// behind it, one click down.
//
// The surface in the middle depends on the kind of work. Research fills
// companies, people, projects and sources; recruiting fills candidates and
// partner firms. The shell around it — tabs, header, worker, activity,
// conversation — is the same for both, and for whatever work comes next.
// ---------------------------------------------------------------------------

export function MissionView({
  workspace,
  canWrite,
  canSeeWorkers,
}: {
  workspace: MissionWorkspace;
  canWrite: boolean;
  canSeeWorkers: boolean;
}) {
  return (
    <div className="-mx-4 -mt-4 xl:-mx-5">
      <MissionTabs tabs={workspace.tabs} activeId={workspace.mission.id} canWrite={canWrite} />
      <div className="px-4 pb-8 pt-5 xl:px-5">
        <MissionHeader workspace={workspace} canWrite={canWrite} />
        <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="min-w-0">
            <Surfaces workspace={workspace} canWrite={canWrite} canSeeWorkers={canSeeWorkers} />
          </div>
          <aside className="xl:sticky xl:top-[76px] xl:h-[calc(100vh-100px)]">
            <WorkerPanel workspace={workspace} canWrite={canWrite} />
          </aside>
        </div>
      </div>
    </div>
  );
}

// ── header ──────────────────────────────────────────────────────────────────

function MissionHeader({ workspace, canWrite }: { workspace: MissionWorkspace; canWrite: boolean }) {
  const router = useRouter();
  const { mission, lead, state, steps } = workspace;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleClosed() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/missions/${mission.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: mission.closedAt ? "reopen" : "close" }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "That did not work.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  const started = new Date(mission.createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

  return (
    <header className="flex flex-wrap items-start gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <MissionMark emoji={mission.emoji} size="lg" />
          <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.02em] text-slate-950">
            {mission.title}
          </h1>
          <StateChip state={state} />
          {workspace.progress && (
            <span
              className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[12px] font-semibold tabular-nums text-slate-700"
              title={`${workspace.progress.criteria.filter((c) => c.met).length} of ${workspace.progress.criteria.length} success criteria met`}
            >
              {workspace.progress.percent}%
            </span>
          )}
        </div>
        <p className="mt-2 max-w-3xl text-[14.5px] leading-relaxed text-slate-600">{mission.objective}</p>
        <p className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-500">
          {lead ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="text-[13px] leading-none">{lead.emoji}</span>
              <span className="font-semibold text-slate-700">{lead.name}</span>
              <span>· {mission.kind === "recruiting" ? "Recruiting" : "Research"}</span>
            </span>
          ) : null}
          <span>Started {started}</span>
          <span suppressHydrationWarning>Updated {ago(mission.updatedAt)}</span>
          <span>
            {steps.length} {steps.length === 1 ? "instruction" : "instructions"}
          </span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <AutonomyMenu leadName={lead?.name ?? "The worker"} />
        {canWrite && (
          <button
            type="button"
            onClick={() => void toggleClosed()}
            disabled={busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[12.5px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {mission.closedAt ? "Reopen mission" : "Close mission"}
          </button>
        )}
      </div>
      {error && <p className="w-full text-[12px] text-rose-600">{error}</p>}
    </header>
  );
}

/**
 * The company's rules, once — not a permissions form on every delegation.
 * The same list the worker is given in its instructions.
 */
function AutonomyMenu({ leadName }: { leadName: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[12.5px] text-slate-600 transition hover:bg-slate-50"
      >
        <ShieldCheck className="h-3.5 w-3.5 text-slate-500" />
        Autonomy: <span className="font-semibold text-slate-900">{AUTONOMY_STANDARD.name}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-30 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-900/10">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
            {leadName} can
          </p>
          <ul className="mt-2 space-y-1.5">
            {AUTONOMY_STANDARD.can.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[12.5px] leading-snug text-slate-700">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-amber-700">
            {leadName} must ask you before
          </p>
          <ul className="mt-2 space-y-1.5">
            {AUTONOMY_STANDARD.mustAsk.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[12.5px] leading-snug text-slate-700">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-slate-100 pt-3 text-[11.5px] leading-snug text-slate-500">
            Company rules, the same on every mission. The database refuses a contact that no person
            confirmed, whatever an employee attempts.
          </p>
        </div>
      )}
    </div>
  );
}

// ── decisions that outlive their row ────────────────────────────────────────

interface RuledOutDecision {
  companyId: string;
  name: string;
  reason: string;
}

/** Lets a row report what it just decided to somewhere that survives the row. */
const RuledOutContext = createContext<(decision: RuledOutDecision) => void>(() => {});

/**
 * "Ruled out GOLDBECK — too big for us. Scout will not bring it back. Undo"
 *
 * Ruling a company out takes it off the Overview list, so the row that was
 * clicked disappears. With nothing else on the screen that is exactly the
 * "whatever I click, nothing happens" the CEO reported about the Today card,
 * and a probe caught it here before he did.
 */
function DecisionStrip({
  decision,
  missionId,
  leadName,
  onClear,
}: {
  decision: RuledOutDecision;
  missionId: string;
  leadName: string;
  onClear: () => void;
}) {
  const router = useRouter();
  const [state, setState] = useState<"done" | "undoing" | "undone">("done");
  const [error, setError] = useState<string | null>(null);

  async function undo() {
    setState("undoing");
    setError(null);
    try {
      const res = await fetch(`/api/missions/${missionId}/entities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "undo_not_for_us", companyId: decision.companyId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not undo it.");
        setState("done");
        return;
      }
      setState("undone");
      router.refresh();
    } catch {
      setError("Network error.");
      setState("done");
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-4 py-2.5 text-[13px] ${
        state === "undone"
          ? "border-slate-200 bg-white text-slate-600"
          : "border-emerald-200 bg-emerald-50 text-emerald-900"
      }`}
    >
      {state === "undone" ? (
        <span>Undone — {decision.name} is back in the mission.</span>
      ) : (
        <span className="flex items-start gap-1.5">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <span>
            <span className="font-semibold">Ruled out {decision.name}</span> — “{decision.reason}”.{" "}
            {leadName} will not bring it back.
          </span>
        </span>
      )}
      <span className="grow" />
      {state !== "undone" && (
        <button
          type="button"
          onClick={() => void undo()}
          disabled={state === "undoing"}
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-[12px] font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50"
        >
          {state === "undoing" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
          Undo
        </button>
      )}
      <button
        type="button"
        onClick={onClear}
        aria-label="Dismiss"
        className="rounded p-1 text-slate-400 transition hover:text-slate-700"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {error && <p className="w-full text-[12px] text-rose-700">{error}</p>}
    </div>
  );
}

// ── surfaces ────────────────────────────────────────────────────────────────

type SurfaceKey =
  | "overview"
  | "companies"
  | "people"
  | "projects"
  | "sources"
  | "candidates"
  | "partners";

function Surfaces({
  workspace,
  canWrite,
  canSeeWorkers,
}: {
  workspace: MissionWorkspace;
  canWrite: boolean;
  canSeeWorkers: boolean;
}) {
  const research = workspace.mission.kind !== "recruiting";
  const [active, setActive] = useState<SurfaceKey>("overview");
  const [decision, setDecision] = useState<RuledOutDecision | null>(null);
  const missionId = workspace.mission.id;

  const tabs: Array<{ key: SurfaceKey; label: string; count?: number }> = research
    ? [
        { key: "overview", label: "Overview" },
        { key: "companies", label: "Companies", count: workspace.companies.length },
        { key: "people", label: "People", count: workspace.people.length },
        { key: "projects", label: "Projects", count: workspace.projects.length },
        { key: "sources", label: "Sources", count: workspace.sources.length },
      ]
    : [
        { key: "overview", label: "Overview" },
        { key: "candidates", label: "Candidates", count: workspace.candidates.length },
        { key: "partners", label: "Partner firms", count: workspace.partners.length },
      ];

  return (
    <RuledOutContext.Provider value={setDecision}>
    <div>
      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="What the mission holds">
        {tabs.map((t) => {
          const on = active === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(t.key)}
              aria-current={on ? "page" : undefined}
              className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-medium transition ${
                on
                  ? "border-slate-900 text-slate-950"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              {t.label}
              {typeof t.count === "number" && (
                <span
                  className={`rounded-md px-1.5 py-px font-mono text-[11px] tabular-nums ${
                    on ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="pt-4">
        {decision && (
          <DecisionStrip
            key={decision.companyId}
            decision={decision}
            missionId={missionId}
            leadName={workspace.lead?.name ?? "The worker"}
            onClear={() => setDecision(null)}
          />
        )}
        {active === "overview" &&
          (research ? (
            <ResearchOverview workspace={workspace} canWrite={canWrite} onOpen={setActive} />
          ) : (
            <RecruitingOverview workspace={workspace} canWrite={canWrite} canSeeWorkers={canSeeWorkers} />
          ))}
        {active === "companies" && (
          <CompanyTable rows={workspace.companies} missionId={missionId} canWrite={canWrite} />
        )}
        {active === "people" && (
          <PeopleTable rows={workspace.people} missionId={missionId} canWrite={canWrite} />
        )}
        {active === "projects" && <ProjectList rows={workspace.projects} />}
        {active === "sources" && <SourceList rows={workspace.sources} />}
        {active === "candidates" &&
          (canSeeWorkers ? <CandidateTable rows={workspace.candidates} /> : <NoWorkers />)}
        {active === "partners" &&
          (canSeeWorkers ? <PartnerTable rows={workspace.partners} /> : <NoWorkers />)}
      </div>
    </div>
    </RuledOutContext.Provider>
  );
}

// ── research: overview ──────────────────────────────────────────────────────

function ResearchOverview({
  workspace,
  canWrite,
  onOpen,
}: {
  workspace: MissionWorkspace;
  canWrite: boolean;
  onOpen: (key: SurfaceKey) => void;
}) {
  const { latest, counts, companies, lead, state, steps, mission } = workspace;
  const running = state === "queued" || state === "working";
  const briefAt = steps.find((s) => s.record)?.completedAt ?? null;
  const live = companies.filter((c) => !c.notForUs);
  const firstMove =
    live.find((c) => c.state === "reachable" && !c.lastAttempt && c.person?.contactId && c.channel) ?? null;
  const name = lead?.name ?? "The worker";

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="px-5 pt-5">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            CEO brief
            {latest && briefAt ? (
              <span
                className="ml-2 font-normal normal-case tracking-normal text-slate-400"
                suppressHydrationWarning
              >
                from {name} · {ago(briefAt)}
              </span>
            ) : null}
          </p>
          <h2 className="mt-2 max-w-3xl text-balance text-[19px] font-semibold leading-snug tracking-[-0.015em] text-slate-950">
            {latest?.brief.headline ||
              (running
                ? `${name} is on the first instruction.`
                : "No brief yet — tell the worker what to do.")}
          </h2>
          {latest?.brief.summary ? (
            <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-slate-600">{latest.brief.summary}</p>
          ) : null}
        </div>
        <Metrics counts={counts} />
        {latest?.brief.recommended ? (
          <Recommended text={latest.brief.recommended} company={firstMove} canWrite={canWrite} />
        ) : null}
      </section>

      <FinishLine
        missionId={mission.id}
        progress={workspace.progress}
        leadName={name}
        running={running}
        canWrite={canWrite}
      />

      <section>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
            Worth acting on
          </h3>
          {companies.length > live.slice(0, 8).length && (
            <button
              type="button"
              onClick={() => onOpen("companies")}
              className="text-[12px] font-medium text-sky-700 hover:underline"
            >
              All {companies.length} companies →
            </button>
          )}
        </div>
        {live.length === 0 ? (
          running ? (
            <Filling name={name} />
          ) : (
            <EmptyNote>
              Nothing on file for this mission yet. Tell {name} what to look for, on the right.
            </EmptyNote>
          )
        ) : (
          <CompanyTable rows={live.slice(0, 8)} missionId={mission.id} canWrite={canWrite} />
        )}
      </section>
    </div>
  );
}

function Metrics({ counts }: { counts: MissionWorkspace["counts"] }) {
  const missing = Math.max(0, counts.qualified - counts.callable);
  const total = counts.researched;
  const segments = [
    { key: "reach", n: counts.callable, swatch: "bg-emerald-500", label: "Someone to reach" },
    { key: "missing", n: missing, swatch: "bg-amber-400", label: "One thing missing" },
    { key: "dead", n: counts.dead, swatch: "bg-rose-300", label: "Not worth chasing" },
    { key: "out", n: counts.notForUs, swatch: "bg-slate-300", label: "Ruled out by you" },
  ];

  return (
    <div className="mt-5 border-t border-slate-100 px-5 py-4">
      <dl className="grid grid-cols-3 gap-4">
        <Metric label="Researched" value={counts.researched} />
        <Metric label="Still in play" value={counts.qualified} />
        <Metric label="Reachable now" value={counts.callable} tone="emerald" />
      </dl>
      {total > 0 && (
        <>
          <div
            className="mt-4 flex h-2 gap-px overflow-hidden rounded-full bg-slate-100"
            role="img"
            aria-label={segments.map((s) => `${s.label}: ${s.n}`).join(", ")}
          >
            {segments
              .filter((s) => s.n > 0)
              .map((s) => (
                <span key={s.key} className={s.swatch} style={{ width: `${(s.n / total) * 100}%` }} />
              ))}
          </div>
          <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-slate-500">
            {segments.map((s) => (
              <li key={s.key} className="inline-flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-[3px] ${s.swatch}`} />
                {s.label}
                <span className="font-mono tabular-nums text-slate-800">{s.n}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "emerald";
}) {
  return (
    <div>
      <dt className="text-[11.5px] font-medium text-slate-500">{label}</dt>
      <dd
        className={`mt-1 text-[30px] font-semibold leading-none tracking-[-0.03em] tabular-nums ${
          tone === "emerald" ? "text-emerald-600" : "text-slate-950"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

/** The first move, set apart the way the Today card is — the one dark surface. */
function Recommended({
  text,
  company,
  canWrite,
}: {
  text: string;
  company: MissionCompanyRow | null;
  canWrite: boolean;
}) {
  return (
    <div className="bg-slate-950 px-5 py-4">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400">
        Recommended
      </p>
      <p className="mt-1.5 max-w-3xl text-[14.5px] leading-relaxed text-slate-100">{text}</p>
      {company?.channel && company.person && canWrite && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ChannelButton channel={company.channel} words={company.words} />
          {company.words && <CopyButton text={company.words} label="Copy the words" dark />}
          <span className="text-[12px] text-slate-400">
            {company.person.name} · {company.name}
          </span>
        </div>
      )}
    </div>
  );
}

function Filling({ name }: { name: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-5 border-b border-slate-100 px-4 py-4">
          <span className="h-3 w-44 animate-pulse rounded bg-slate-100" />
          <span className="h-3 w-28 animate-pulse rounded bg-slate-100" />
          <span className="h-3 w-36 animate-pulse rounded bg-slate-100" />
          <span className="ml-auto h-5 w-16 animate-pulse rounded-full bg-slate-100" />
        </div>
      ))}
      <p className="px-4 py-3 text-[12.5px] text-slate-500">
        Companies appear here as {name} files them, each with its source.
      </p>
    </div>
  );
}

// ── research: records ───────────────────────────────────────────────────────

const COMPANY_GRID =
  "grid grid-cols-1 gap-x-4 gap-y-2 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1.15fr)_7.5rem_16px] md:items-center";

function CompanyTable({
  rows,
  missionId,
  canWrite,
}: {
  rows: MissionCompanyRow[];
  missionId: string;
  canWrite: boolean;
}) {
  if (rows.length === 0) return <EmptyNote>No companies on file for this mission yet.</EmptyNote>;
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div
        className={`${COMPANY_GRID} hidden border-b border-slate-100 bg-slate-50/80 px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-500 md:grid`}
      >
        <span>Company</span>
        <span>Buyer</span>
        <span>Way in</span>
        <span>Status</span>
        <span />
      </div>
      <ul className="divide-y divide-slate-100">
        {rows.map((row) => (
          <CompanyItem key={row.companyId} row={row} missionId={missionId} canWrite={canWrite} />
        ))}
      </ul>
    </div>
  );
}

function CompanyItem({
  row,
  missionId,
  canWrite,
}: {
  row: MissionCompanyRow;
  missionId: string;
  canWrite: boolean;
}) {
  const [open, setOpen] = useState(false);
  const status = companyStatus(row);
  return (
    <li className={row.notForUs ? "bg-slate-50/70" : ""}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`${COMPANY_GRID} w-full px-4 py-3 text-left transition hover:bg-slate-50`}
      >
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-1.5">
            <span
              className={`truncate text-[14px] font-semibold tracking-[-0.01em] ${
                row.notForUs ? "text-slate-500 line-through decoration-slate-300" : "text-slate-900"
              }`}
            >
              {row.name}
            </span>
            <Provenance agentFound={row.agentFound} verified={row.verified} />
          </span>
          <span className="mt-0.5 block truncate text-[12px] text-slate-500">
            {[row.city, row.country].filter(Boolean).join(", ") || "Location not recorded"}
            {row.role ? ` · ${row.role}` : ""}
          </span>
        </span>
        <span className="min-w-0">
          {row.person ? (
            <>
              <span className="block truncate text-[13px] font-medium text-slate-800">{row.person.name}</span>
              {row.person.title && (
                <span className="block truncate text-[12px] text-slate-500">{row.person.title}</span>
              )}
            </>
          ) : (
            <span className="text-[12.5px] text-slate-400">Not named yet</span>
          )}
        </span>
        <span className="min-w-0">
          {row.channel ? (
            <ChannelLine channel={row.channel} />
          ) : (
            <span className="text-[12.5px] text-slate-400">—</span>
          )}
        </span>
        <span>
          <StatusPill {...status} />
        </span>
        <ChevronRight
          className={`hidden h-4 w-4 text-slate-400 transition md:block ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && <CompanyDetail row={row} missionId={missionId} canWrite={canWrite} />}
    </li>
  );
}

function CompanyDetail({
  row,
  missionId,
  canWrite,
}: {
  row: MissionCompanyRow;
  missionId: string;
  canWrite: boolean;
}) {
  return (
    <div className="grid gap-5 border-t border-slate-100 bg-slate-50/70 px-4 py-4 lg:grid-cols-2">
      <div className="space-y-3.5">
        {row.why && <Fact label="Why it is here">{row.why}</Fact>}
        {row.missing && (
          <Fact label="The one thing missing" tone="amber">
            {row.missing.fact}
            <span className="text-amber-700"> — {row.missing.owner} fetches it</span>
            {row.reachNote ? (
              <span className="mt-1 block text-slate-500">Its site was read: {row.reachNote}</span>
            ) : null}
          </Fact>
        )}
        {row.deadReason && (
          <Fact label="Not worth chasing" tone="rose">
            {row.deadReason}
          </Fact>
        )}
        {row.project && (
          <Fact label="Project named">
            {row.project.name}
            {row.project.evidence ? (
              <span className="block text-slate-500">{row.project.evidence}</span>
            ) : null}
          </Fact>
        )}
        {row.alsoIn.length > 0 && (
          <Fact label="Also found in">
            <span className="flex flex-wrap gap-1.5">
              {row.alsoIn.map((m) => (
                <Link
                  key={m.id}
                  href={`/missions/${m.id}`}
                  className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[12px] text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100"
                >
                  <MissionMark emoji={m.emoji} size="sm" />
                  {m.title}
                </Link>
              ))}
            </span>
          </Fact>
        )}
        <Fact label={`Sources · ${row.sources.length}`}>
          <SourceLinks sources={row.sources} />
        </Fact>
      </div>

      <div className="space-y-3.5">
        {row.notForUs ? (
          <RuledOut row={row} missionId={missionId} canWrite={canWrite} />
        ) : (
          <>
            {row.words && <Words text={row.words} />}
            {row.person?.contactId && row.channel && canWrite ? (
              <ContactControls
                personId={row.person.contactId}
                personName={row.person.name}
                channel={row.channel}
                words={row.words}
                lastAttempt={row.lastAttempt}
              />
            ) : row.lastAttempt ? (
              <LastAttempt attempt={row.lastAttempt} />
            ) : null}
          </>
        )}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-3">
          {canWrite && !row.verified && (
            <VerifyButton
              missionId={missionId}
              entityType="company"
              entityId={row.companyId}
              label="Verify company"
            />
          )}
          {canWrite && !row.notForUs && (
            <NotForUsButton missionId={missionId} companyId={row.companyId} name={row.name} />
          )}
          <span className="grow" />
          <Link
            href={`/companies/${row.companyId}`}
            className="inline-flex items-center gap-1 text-[12.5px] font-medium text-slate-600 transition hover:text-slate-900"
          >
            Company record
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}

const PEOPLE_GRID =
  "grid grid-cols-1 gap-x-4 gap-y-2 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.15fr)_7.5rem_16px] md:items-center";

function PeopleTable({
  rows,
  missionId,
  canWrite,
}: {
  rows: MissionPersonRow[];
  missionId: string;
  canWrite: boolean;
}) {
  if (rows.length === 0) {
    return <EmptyNote>Nobody named yet. People appear here as the buyers behind each company are found.</EmptyNote>;
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div
        className={`${PEOPLE_GRID} hidden border-b border-slate-100 bg-slate-50/80 px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-500 md:grid`}
      >
        <span>Person</span>
        <span>Company</span>
        <span>Way in</span>
        <span>Status</span>
        <span />
      </div>
      <ul className="divide-y divide-slate-100">
        {rows.map((row) => (
          <PersonItem key={row.contactId} row={row} missionId={missionId} canWrite={canWrite} />
        ))}
      </ul>
    </div>
  );
}

function PersonItem({
  row,
  missionId,
  canWrite,
}: {
  row: MissionPersonRow;
  missionId: string;
  canWrite: boolean;
}) {
  const [open, setOpen] = useState(false);
  const status = personStatus(row);
  return (
    <li className={row.notForUs ? "bg-slate-50/70" : ""}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`${PEOPLE_GRID} w-full px-4 py-3 text-left transition hover:bg-slate-50`}
      >
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-1.5">
            <span
              className={`truncate text-[14px] font-semibold ${
                row.notForUs ? "text-slate-500 line-through decoration-slate-300" : "text-slate-900"
              }`}
            >
              {row.name}
            </span>
            <Provenance agentFound={row.agentFound} verified={row.verified} />
          </span>
          {row.title && <span className="mt-0.5 block truncate text-[12px] text-slate-500">{row.title}</span>}
        </span>
        <span className="truncate text-[13px] text-slate-700">{row.companyName ?? "—"}</span>
        <span className="min-w-0">
          {row.channel ? (
            <ChannelLine channel={row.channel} />
          ) : (
            <span className="text-[12.5px] text-slate-400">No published way in yet</span>
          )}
        </span>
        <span>
          <StatusPill {...status} />
        </span>
        <ChevronRight
          className={`hidden h-4 w-4 text-slate-400 transition md:block ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && (
        <div className="grid gap-5 border-t border-slate-100 bg-slate-50/70 px-4 py-4 lg:grid-cols-2">
          <div className="space-y-3.5">
            {row.missing && (
              <Fact label="The one thing missing" tone="amber">
                {row.missing}
              </Fact>
            )}
            {row.sourceUrl && (
              <Fact label="Named on">
                <SourceLinks sources={[{ url: row.sourceUrl, claim: "" }]} />
              </Fact>
            )}
            {row.lastAttempt && <LastAttempt attempt={row.lastAttempt} />}
          </div>
          <div className="space-y-3.5">
            {row.words && <Words text={row.words} />}
            {row.channel && canWrite && !row.notForUs && (
              <ContactControls
                personId={row.contactId}
                personName={row.name}
                channel={row.channel}
                words={row.words}
                lastAttempt={row.lastAttempt}
              />
            )}
            {canWrite && !row.verified && (
              <div className="border-t border-slate-200/70 pt-3">
                <VerifyButton
                  missionId={missionId}
                  entityType="contact"
                  entityId={row.contactId}
                  label="Verify person"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function ProjectList({ rows }: { rows: MissionProjectRow[] }) {
  if (rows.length === 0) {
    return <EmptyNote>No projects named yet. A current project is recorded when a company is found working on one.</EmptyNote>;
  }
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {rows.map((p) => (
          <li key={`${p.name}-${p.companyId}`} className="px-4 py-3.5">
            <p className="text-[14px] font-semibold text-slate-900">{p.name}</p>
            <p className="mt-0.5 text-[12px] text-slate-500">{p.companyName}</p>
            {p.evidence && <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-slate-600">{p.evidence}</p>}
            {p.sourceUrl && (
              <div className="mt-1.5">
                <SourceLinks sources={[{ url: p.sourceUrl, claim: "" }]} />
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="px-1 text-[12px] text-slate-500">
        Named along the way. None of these is a project record yet — a project enters the pipeline
        only when a person decides it is one.
      </p>
    </div>
  );
}

function SourceList({ rows }: { rows: MissionSourceRow[] }) {
  if (rows.length === 0) return <EmptyNote>No sources yet. Every record this mission files cites one.</EmptyNote>;
  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {rows.map((s) => (
        <li key={s.url} className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
          <div className="min-w-0">
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[13.5px] font-semibold text-sky-700 hover:underline"
            >
              {s.host}
              <ArrowUpRight className="h-3 w-3" />
            </a>
            <p className="truncate font-mono text-[11px] text-slate-400">{s.url}</p>
            {s.claims.slice(0, 2).map((c) => (
              <p key={c} className="mt-1 text-[12.5px] leading-snug text-slate-600">
                “{c}”
              </p>
            ))}
          </div>
          <div className="flex flex-wrap content-start gap-1 md:justify-end">
            {s.about.map((a) => (
              <span key={a} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11.5px] text-slate-700">
                {a}
              </span>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── recruiting ──────────────────────────────────────────────────────────────

function RecruitingOverview({
  workspace,
  canWrite,
  canSeeWorkers,
}: {
  workspace: MissionWorkspace;
  canWrite: boolean;
  canSeeWorkers: boolean;
}) {
  const { latest, lead, state, candidates, partners } = workspace;
  const running = state === "queued" || state === "working";
  const headline = latest?.brief.headline ?? "";
  const rest = latest?.brief.summary.startsWith(headline)
    ? latest.brief.summary.slice(headline.length).trim()
    : latest?.brief.summary ?? "";
  const blockers = latest?.candidates?.blockers ?? [];
  const missing = latest?.candidates?.missing ?? [];

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="px-5 py-5">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-slate-500">Brief</p>
          <h2 className="mt-2 max-w-3xl text-balance text-[19px] font-semibold leading-snug tracking-[-0.015em] text-slate-950">
            {headline || (running ? `${lead?.name ?? "The worker"} is reading the pool.` : "No brief yet.")}
          </h2>
          {rest && <p className="mt-2 max-w-3xl whitespace-pre-line text-[14px] leading-relaxed text-slate-600">{rest}</p>}
        </div>
        <dl className="grid grid-cols-2 gap-4 border-t border-slate-100 px-5 py-4">
          <Metric label="People named" value={candidates.length} tone="emerald" />
          <Metric label="Partner firms" value={partners.length} />
        </dl>
        {blockers.length > 0 && (
          <div className="border-t border-slate-100 px-5 py-4">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-amber-700">
              What stands in the way
            </p>
            <ul className="mt-2 space-y-1">
              {blockers.map((b) => (
                <li key={b} className="flex items-start gap-2 text-[13px] leading-snug text-amber-900">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                  {b}
                </li>
              ))}
            </ul>
          </div>
        )}
        {missing.length > 0 && (
          <p className="border-t border-slate-100 px-5 py-3 text-[12.5px] text-slate-500">
            Nobody has recorded: {missing.join("; ")}.
          </p>
        )}
      </section>
      <FinishLine
        missionId={workspace.mission.id}
        progress={workspace.progress}
        leadName={lead?.name ?? "The worker"}
        running={running}
        canWrite={canWrite}
      />
      {canSeeWorkers ? <CandidateTable rows={candidates} /> : <NoWorkers />}
    </div>
  );
}

function CandidateTable({ rows }: { rows: MissionCandidate[] }) {
  if (rows.length === 0) return <EmptyNote>Nobody from the pool named for this yet.</EmptyNote>;
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)] gap-4 border-b border-slate-100 bg-slate-50/80 px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-500 md:grid">
        <span>Candidate</span>
        <span>Availability</span>
        <span>Based</span>
        <span>Certificates</span>
      </div>
      <ul className="divide-y divide-slate-100">
        {rows.map((c) => (
          <li
            key={c.workerId}
            className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)] md:items-center md:gap-4"
          >
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-semibold text-slate-900">{c.name}</span>
              <span className="block truncate text-[12px] text-slate-500">
                {c.role ?? "Role not recorded"}
                {c.status === "candidate" ? " · off a CV" : ""}
              </span>
            </span>
            <span className="text-[13px] text-slate-700">
              {c.availability ? c.availability.replace(/_/g, " ") : "Not recorded"}
              {c.availableFrom ? <span className="block text-[12px] text-slate-500">from {c.availableFrom}</span> : null}
            </span>
            <span className="truncate text-[13px] text-slate-700">{c.based ?? "—"}</span>
            <span className="flex flex-wrap gap-1">
              {c.certificates.length === 0 ? (
                <span className="text-[12.5px] text-slate-400">None recorded</span>
              ) : (
                <>
                  {c.certificates.slice(0, 3).map((cert) => (
                    <span key={cert} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11.5px] text-slate-700">
                      {cert}
                    </span>
                  ))}
                  {c.certificates.length > 3 && (
                    <span className="text-[11.5px] text-slate-500">+{c.certificates.length - 3}</span>
                  )}
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PartnerTable({ rows }: { rows: MissionPartner[] }) {
  if (rows.length === 0) return <EmptyNote>No partner firm named for this yet.</EmptyNote>;
  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {rows.map((p) => (
        <li key={p.partnerId} className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_auto] md:items-center md:gap-4">
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-semibold text-slate-900">{p.name}</span>
            <span className="block text-[12px] text-slate-500">{p.country ?? "Country not recorded"}</span>
          </span>
          <span className="text-[13px] text-slate-700">
            {p.trades.join(", ") || "Trades not recorded"}
            {p.crewSize !== null ? <span className="text-slate-500"> · up to {p.crewSize}</span> : null}
          </span>
          <StatusPill
            label={
              p.sellable && p.confirmedDaysAgo !== null
                ? `Confirmed ${p.confirmedDaysAgo}d ago`
                : "Not confirmed"
            }
            tone={p.sellable ? "emerald" : "amber"}
          />
        </li>
      ))}
    </ul>
  );
}

function NoWorkers() {
  return <EmptyNote>Your role cannot see Triangle&apos;s people, so the names are not shown here.</EmptyNote>;
}

// ── small parts ─────────────────────────────────────────────────────────────

const PILL: Record<"emerald" | "amber" | "rose" | "slate" | "sky", string> = {
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  rose: "bg-rose-50 text-rose-700 ring-rose-200",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
  sky: "bg-sky-50 text-sky-700 ring-sky-200",
};

function StatusPill({
  label,
  tone,
  title,
}: {
  label: string;
  tone: keyof typeof PILL;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex max-w-full items-center truncate whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] ring-1 ring-inset ${PILL[tone]}`}
    >
      {label}
    </span>
  );
}

const OUTCOME_WORD: Record<string, string> = {
  sent: "Sent",
  reached: "Talked",
  no_answer: "No answer",
  dead_end: "Dead end",
};

function companyStatus(row: MissionCompanyRow): { label: string; tone: keyof typeof PILL; title?: string } {
  if (row.notForUs) return { label: "Ruled out", tone: "slate", title: row.notForUs.reason };
  if (row.lastAttempt) {
    return {
      label: OUTCOME_WORD[row.lastAttempt.outcome ?? ""] ?? "Contacted",
      tone: row.lastAttempt.outcome === "dead_end" ? "slate" : "sky",
      title: `Recorded ${ago(row.lastAttempt.at)}`,
    };
  }
  if (row.state === "reachable") return { label: "Ready", tone: "emerald" };
  if (row.state === "dead") return { label: "Dead", tone: "rose", title: row.deadReason ?? undefined };
  if (!row.person) return { label: "Buyer?", tone: "amber", title: row.missing?.fact };
  if (!row.channel) return { label: "Way in?", tone: "amber", title: row.missing?.fact };
  return { label: "1 missing", tone: "amber", title: row.missing?.fact };
}

function personStatus(row: MissionPersonRow): { label: string; tone: keyof typeof PILL; title?: string } {
  if (row.notForUs) return { label: "Ruled out", tone: "slate" };
  if (row.lastAttempt) {
    return {
      label: OUTCOME_WORD[row.lastAttempt.outcome ?? ""] ?? "Contacted",
      tone: row.lastAttempt.outcome === "dead_end" ? "slate" : "sky",
    };
  }
  if (row.state === "reachable") return { label: "Ready", tone: "emerald" };
  if (row.state === "dead") return { label: "Dead", tone: "rose" };
  if (!row.channel) return { label: "Way in?", tone: "amber", title: row.missing ?? undefined };
  return { label: "1 missing", tone: "amber", title: row.missing ?? undefined };
}

function Provenance({ agentFound, verified }: { agentFound: boolean; verified: boolean }) {
  if (verified) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-px text-[10.5px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
        <BadgeCheck className="h-3 w-3" />
        Verified
      </span>
    );
  }
  if (agentFound) {
    return (
      <span
        title="Created by an employee from a public source. Nobody has confirmed it yet."
        className="rounded-md bg-sky-50 px-1.5 py-px text-[10.5px] font-medium text-sky-700 ring-1 ring-inset ring-sky-200"
      >
        Agent-found
      </span>
    );
  }
  return null;
}

const WHOSE: Record<MissionChannel["whose"], string> = {
  person: "their own",
  department: "department",
  switchboard: "switchboard",
};

function ChannelLine({ channel }: { channel: MissionChannel }) {
  const Icon =
    channel.kind === "phone" ? Phone : channel.kind === "email" ? Mail : channel.kind === "linkedin" ? UserRound : Link2;
  const value =
    channel.kind === "linkedin"
      ? "LinkedIn profile"
      : channel.kind === "contact_form"
        ? hostOf(channel.value)
        : channel.value;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Icon className={`h-3.5 w-3.5 shrink-0 ${channel.kind === "phone" ? "text-emerald-600" : "text-sky-600"}`} />
      <span className="min-w-0">
        <span className="block truncate font-mono text-[12.5px] text-slate-800">{value}</span>
        <span className="block text-[11px] text-slate-500">{WHOSE[channel.whose]}</span>
      </span>
    </span>
  );
}

function ChannelButton({ channel, words }: { channel: MissionChannel; words: string | null }) {
  const base =
    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition";
  if (channel.kind === "phone") {
    return (
      <a href={telHref(channel.value)} className={`${base} bg-emerald-500 text-emerald-950 hover:bg-emerald-400`}>
        <Phone className="h-3.5 w-3.5" />
        Dial {channel.value}
      </a>
    );
  }
  if (channel.kind === "email") {
    return (
      <a
        href={`mailto:${channel.value}${words ? `?body=${encodeURIComponent(words)}` : ""}`}
        className={`${base} bg-sky-500 text-sky-950 hover:bg-sky-400`}
      >
        <Mail className="h-3.5 w-3.5" />
        Open mail
      </a>
    );
  }
  return (
    <a
      href={channel.value}
      target="_blank"
      rel="noreferrer"
      className={`${base} bg-slate-900 text-white ring-1 ring-white/15 hover:bg-slate-800`}
    >
      {channel.kind === "linkedin" ? "Open profile" : "Open the form"}
      <ArrowUpRight className="h-3.5 w-3.5" />
    </a>
  );
}

function CopyButton({ text, label, dark = false }: { text: string; label: string; dark?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        } catch {
          // Nothing reached the clipboard; the words stay on screen to select.
        }
      }}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition ${
        dark
          ? "border-white/15 text-slate-200 hover:bg-white/10"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : label}
    </button>
  );
}

function Words({ text }: { text: string }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500">What to say</p>
        <CopyButton text={text} label="Copy" />
      </div>
      <pre className="mt-1.5 whitespace-pre-wrap rounded-xl border border-slate-200 bg-white px-3.5 py-3 font-mono text-[12.5px] leading-[1.7] text-slate-700">
        {text}
      </pre>
    </div>
  );
}

function LastAttempt({ attempt }: { attempt: MissionAttempt }) {
  return (
    <p className="text-[12px] text-slate-500" suppressHydrationWarning>
      Last recorded: <span className="font-medium text-slate-700">{OUTCOME_WORD[attempt.outcome ?? ""] ?? "a contact"}</span>{" "}
      · {ago(attempt.at)}
    </p>
  );
}

/**
 * Dial or write, then say what happened — the same three words as the Today
 * card, fitted to the channel, and a way to take a mis-click back.
 */
function ContactControls({
  personId,
  personName,
  channel,
  words,
  lastAttempt,
}: {
  personId: string;
  personName: string;
  channel: MissionChannel;
  words: string | null;
  lastAttempt: MissionAttempt | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<ContactOutcome | null>(null);
  const [logged, setLogged] = useState<{ actionId: string; sentence: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const outcomes = outcomesFor(channel.kind);

  async function log(outcome: ContactOutcome) {
    setBusy(outcome);
    setError(null);
    try {
      const res = await fetch("/api/outreach/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId,
          channelKind: channel.kind,
          value: channel.value,
          outcome,
          content: words ?? undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; actionId?: string };
      if (!res.ok || !body.actionId) {
        setError(body.error ?? "Could not record that.");
        return;
      }
      setLogged({ actionId: body.actionId, sentence: outcomeSentence(outcome, channel.kind) });
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(null);
    }
  }

  async function undo() {
    if (!logged) return;
    setError(null);
    try {
      const res = await fetch("/api/outreach/log", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: logged.actionId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not undo it.");
        return;
      }
      setLogged(null);
      router.refresh();
    } catch {
      setError("Network error.");
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <ChannelButton channel={channel} words={words} />
        {words && <CopyButton text={words} label="Copy the words" />}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[11.5px] text-slate-500">
          {lastAttempt ? "Tried again? Record it:" : `After you reach out to ${personName}:`}
        </span>
        <div className="flex overflow-hidden rounded-lg border border-slate-200">
          {outcomes.map(({ outcome, label }, i) => (
            <button
              key={outcome}
              type="button"
              disabled={busy !== null}
              onClick={() => void log(outcome)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 ${
                i > 0 ? "border-l border-slate-200" : ""
              }`}
            >
              {busy === outcome && <Loader2 className="h-3 w-3 animate-spin" />}
              {label}
            </button>
          ))}
        </div>
      </div>
      {channel.kind !== "phone" && (
        <p className="mt-2 text-[11px] text-slate-500">
          Opening mail sends nothing — press Sent once it has actually gone.
        </p>
      )}
      {logged && (
        <p role="status" className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-emerald-800">
          <Check className="h-3.5 w-3.5 text-emerald-600" />
          Recorded: {logged.sentence} — {personName}
          <button
            type="button"
            onClick={() => void undo()}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-semibold text-emerald-900 ring-1 ring-emerald-200 transition hover:bg-emerald-50"
          >
            <Undo2 className="h-3 w-3" />
            Undo
          </button>
        </p>
      )}
      {error && <p className="mt-2 text-[12px] text-rose-600">{error}</p>}
    </div>
  );
}

function VerifyButton({
  missionId,
  entityType,
  entityId,
  label,
}: {
  missionId: string;
  entityType: "company" | "contact";
  entityId: string;
  label: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/missions/${missionId}/entities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", entityType, entityId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not verify it.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void verify()}
        disabled={busy}
        title="You checked it and it is right. It stops being marked agent-found."
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />}
        {label}
      </button>
      {error && <span className="text-[12px] text-rose-600">{error}</span>}
    </>
  );
}

function NotForUsButton({
  missionId,
  companyId,
  name,
}: {
  missionId: string;
  companyId: string;
  name: string;
}) {
  const router = useRouter();
  const onRuledOut = useContext(RuledOutContext);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ruleOut() {
    if (reason.trim().length < 3 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/missions/${missionId}/entities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "not_for_us", companyId, reason: reason.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not rule it out.");
        return;
      }
      setOpen(false);
      onRuledOut({ companyId, name, reason: reason.trim() });
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Take this company out of the mission, with the reason, so it is not brought back"
        className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-slate-500 transition hover:bg-rose-50 hover:text-rose-700"
      >
        {/* Not "Not for us": that is the email outcome beside it, which records
            a dead end in the ledger. One label must mean one thing. */}
        Rule out
      </button>
    );
  }
  return (
    <div className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50/70 p-2">
      <input
        autoFocus
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void ruleOut();
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Why? Wrong trade, too big, already a client…"
        className="h-8 min-w-[10rem] grow rounded-lg border border-rose-200 bg-white px-2.5 text-[12.5px] text-slate-900 placeholder-rose-300 focus:border-rose-400 focus:outline-none"
      />
      <button
        type="button"
        disabled={busy || reason.trim().length < 3}
        onClick={() => void ruleOut()}
        className="inline-flex items-center gap-1.5 rounded-lg bg-rose-700 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-rose-600 disabled:opacity-40"
      >
        {busy && <Loader2 className="h-3 w-3 animate-spin" />}
        Rule it out
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="px-1 text-[12px] text-slate-500 transition hover:text-slate-800"
      >
        Cancel
      </button>
      {error && <p className="w-full text-[12px] text-rose-700">{error}</p>}
    </div>
  );
}

function RuledOut({
  row,
  missionId,
  canWrite,
}: {
  row: MissionCompanyRow;
  missionId: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!row.notForUs) return null;

  async function undo() {
    setBusy(true);
    try {
      await fetch(`/api/missions/${missionId}/entities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "undo_not_for_us", companyId: row.companyId }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500">Ruled out</p>
      <p className="mt-1 text-[13px] text-slate-700">{row.notForUs.reason}</p>
      <p className="mt-1 text-[11.5px] text-slate-400" suppressHydrationWarning>
        {ago(row.notForUs.at)} · the worker will not bring it back
      </p>
      {canWrite && (
        <button
          type="button"
          onClick={() => void undo()}
          disabled={busy}
          className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-slate-600 transition hover:text-slate-900 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
          Undo
        </button>
      )}
    </div>
  );
}

function SourceLinks({ sources }: { sources: Array<{ url: string; claim: string }> }) {
  return (
    <ul className="space-y-1.5">
      {sources.map((s) => (
        <li key={s.url}>
          <a
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[12.5px] font-medium text-sky-700 hover:underline"
          >
            {hostOf(s.url)}
            <ArrowUpRight className="h-3 w-3" />
          </a>
          {s.claim && <span className="block text-[12px] leading-snug text-slate-500">{s.claim}</span>}
        </li>
      ))}
    </ul>
  );
}

function Fact({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: "amber" | "rose";
  children: React.ReactNode;
}) {
  const color = tone === "amber" ? "text-amber-700" : tone === "rose" ? "text-rose-700" : "text-slate-500";
  return (
    <div>
      <p className={`text-[10.5px] font-semibold uppercase tracking-[0.14em] ${color}`}>{label}</p>
      <div className="mt-1 text-[13px] leading-relaxed text-slate-700">{children}</div>
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-slate-300 px-5 py-8 text-center text-[13px] text-slate-500">
      {children}
    </p>
  );
}
