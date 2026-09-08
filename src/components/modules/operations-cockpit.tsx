"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bot,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  Inbox,
  Lightbulb,
  Loader2,
  Mail,
  Phone,
  Radar,
  Send,
  Sparkles,
  Target,
  UserRound,
  X,
} from "lucide-react";
import { AgentReport } from "@/components/modules/agent-report";
import { Badge } from "@/components/ui/badge";
import { telHref } from "@/lib/data/contact-channels";
import type { NextMove, NextMoveAction } from "@/lib/data/next-move";
import type { DecisionInboxSnapshot } from "@/lib/data/decision-inbox";
import type { Play } from "@/lib/data/plays";
import { cn } from "@/lib/utils";

export interface CockpitEmployee {
  id: string;
  name: string;
  emoji: string;
  roleTitle: string | null;
}

export interface CockpitRecentResult {
  id: string;
  title: string;
  status: string;
  resultSummary: string | null;
  authorName: string;
  authorEmoji: string;
  at: string;
}

export interface OperationsCockpitProps {
  move: NextMove;
  employees: CockpitEmployee[];
  recentResults: CockpitRecentResult[];
  plays: Play[];
  snapshot: DecisionInboxSnapshot;
  archives?: {
    projectsCount?: number;
    companiesCount?: number;
    leadsCount?: number;
    workersCount?: number;
  };
}

type DrawerItem =
  | {
      type: "result";
      id: string;
      title: string;
      authorName: string;
      authorEmoji: string;
      at: string;
      content: string;
    }
  | {
      type: "decision";
      id: string;
      title: string;
      kind: string;
      label: string;
      recommendation: string;
      nextHumanStep: string;
      businessImpact: string;
      unknowns: string[];
      detail: string | null;
      at: string;
      href: string | null;
    }
  | {
      type: "play";
      id: string;
      title: string;
      authorName: string;
      authorEmoji: string;
      hypothesis: string;
      nextStep: string;
      findingId: string;
      options: Array<{ id: string; label: string; explanation: string }>;
    };

export function OperationsCockpit({
  move,
  employees,
  recentResults,
  plays,
  snapshot,
  archives,
}: OperationsCockpitProps) {
  const router = useRouter();

  // Top command bar state
  const [selectedAgent, setSelectedAgent] = useState(employees[0]?.id ?? "");
  const [brief, setBrief] = useState("");
  const [execState, setExecState] = useState<"idle" | "sending" | "working">("idle");
  const [execMessage, setExecMessage] = useState<string | null>(null);
  const [execError, setExecError] = useState<string | null>(null);

  const [workingStartedAt, setWorkingStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  // Active desk tab & slide-over drawer
  const [activeDeskTab, setActiveDeskTab] = useState<"all" | "answers" | "ideas" | "approvals">("all");
  const [drawerItem, setDrawerItem] = useState<DrawerItem | null>(null);

  // Timer for in-app execution
  useEffect(() => {
    if (!workingStartedAt) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [workingStartedAt]);

  const elapsedSec = workingStartedAt ? Math.max(0, Math.floor((now - workingStartedAt) / 1000)) : 0;

  // Keyboard shortcut: Escape closes the slide-over drawer
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawerItem(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  async function handleAskAgent(e: React.FormEvent) {
    e.preventDefault();
    const text = brief.trim();
    if (text.length < 5 || execState !== "idle") return;

    setExecError(null);
    setExecMessage(null);
    setExecState("sending");

    try {
      const created = await fetch("/api/agents/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentInstanceId: selectedAgent,
          title: text.split("\n")[0].slice(0, 120),
          objective: text,
          priority: "high",
          constraints: { execution_mode: "in_app" },
        }),
      });

      const createdBody = (await created.json().catch(() => ({}))) as { error?: string };
      if (!created.ok) {
        setExecError(createdBody.error ?? "Failed to queue assignment.");
        setExecState("idle");
        return;
      }

      setExecState("working");
      setWorkingStartedAt(Date.now());
      const ran = await fetch("/api/agents/run-now", { method: "POST" });
      const ranBody = (await ran.json().catch(() => ({}))) as {
        status?: string;
        message?: string;
        error?: string;
      };

      if (!ran.ok) {
        setExecMessage(`Handed out, but run stalled: ${ranBody.error ?? "pending execution"}.`);
      } else {
        setExecMessage(ranBody.message ?? "Research completed. Result updated below.");
      }

      setBrief("");
      router.refresh();
    } catch {
      setExecError("Connection error while assigning task.");
    } finally {
      setWorkingStartedAt(null);
      setExecState("idle");
    }
  }

  // Suggestion chips to save typing
  const suggestionChips = [
    "Find HVAC and EPC contractors in Frankfurt looking for subcontractors",
    "Match available roster to open g2 requisitions",
    "Find electrical installation packages on data centers in Germany",
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* ────────────────────────────────────────────────────────────────── */}
      {/* 1. TOP PERSISTENT AGENT DISPATCH BAR                               */}
      {/* ────────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-5 text-white shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/20 text-sky-400">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-300">
              Agent Command Bar
            </span>
          </div>
          <span className="text-xs text-slate-400">
            Autonomous in-app execution • Zero human transport
          </span>
        </div>

        <form onSubmit={handleAskAgent} className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              disabled={execState !== "idle"}
              className="h-11 rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-medium text-white transition focus:border-sky-500 focus:outline-none disabled:opacity-50"
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.emoji} {e.name}
                  {e.roleTitle ? ` (${e.roleTitle})` : ""}
                </option>
              ))}
            </select>

            <input
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              disabled={execState !== "idle"}
              placeholder="Tell Scout or Hanna what to find (e.g. 'Find HVAC & EPC contractors in Frankfurt needing subs')..."
              className="h-11 min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900/90 px-4 text-sm text-white placeholder-slate-400 transition focus:border-sky-500 focus:bg-slate-900 focus:outline-none disabled:opacity-50"
            />

            <button
              type="submit"
              disabled={execState !== "idle" || brief.trim().length < 5}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-sky-500 px-5 text-sm font-bold text-white shadow-md shadow-sky-900/40 transition hover:bg-sky-400 disabled:opacity-40"
            >
              {execState === "idle" ? (
                <>
                  <span>Run Now</span>
                  <Send className="h-4 w-4" />
                </>
              ) : (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{execState === "sending" ? "Queueing…" : `Working (${elapsedSec}s)…`}</span>
                </>
              )}
            </button>
          </div>

          {/* Suggestion Chips */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11px] font-semibold text-slate-400">Quick queries:</span>
            {suggestionChips.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setBrief(chip)}
                className="rounded-full border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs text-slate-300 transition hover:border-slate-700 hover:text-white"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Live Progress Feedback */}
          {execState === "working" && (
            <div className="flex items-center gap-3 rounded-xl border border-sky-500/30 bg-sky-950/40 px-4 py-2.5 text-xs text-sky-200">
              <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
              <span>
                Agent is researching in-app right now ({elapsedSec}s elapsed). Results will appear
                automatically in the <strong>Agent Desk</strong> on the right.
              </span>
            </div>
          )}

          {execMessage && (
            <p className="text-xs font-medium text-emerald-400">{execMessage}</p>
          )}
          {execError && (
            <p className="text-xs font-medium text-rose-400">{execError}</p>
          )}
        </form>
      </section>

      {/* ────────────────────────────────────────────────────────────────── */}
      {/* 2. THE TWO-COLUMN COCKPIT (HUMAN ACTIONS vs AGENT INTELLIGENCE)    */}
      {/* ────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* ── LEFT COLUMN: HUMAN ACTIONS (DO THIS TODAY) ────────────────── */}
        <div className="space-y-4 lg:col-span-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-100 text-amber-800">
                <Target className="h-3.5 w-3.5" />
              </span>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                1. Human Actions (Do This Today)
              </h2>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
              {move.clear ? "0 pending" : "1 priority"}
            </span>
          </div>

          {/* Primary Action Card */}
          {move.clear ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
              <h3 className="mt-2 text-sm font-bold text-emerald-950">
                All caught up on warm demand
              </h3>
              <p className="mt-1 text-xs text-emerald-800">
                No overdue calls or unworked buyer requisitions right now. Your agents are hunting in the background.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-900 bg-slate-950 p-5 text-white shadow-lg">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="inline-block rounded-md bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-300">
                    Highest Commercial Leverage
                  </span>
                  <h3 className="mt-1.5 text-base font-bold leading-snug text-white">
                    {move.headline}
                  </h3>
                  {move.action && (
                    <p className="mt-0.5 text-xs text-slate-400">
                      {[move.action.personRole, move.action.company].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
              </div>

              <p className="mt-2.5 text-xs leading-relaxed text-slate-300">
                {move.because}
              </p>

              {move.action && <CockpitActionPanel action={move.action} />}
            </div>
          )}

          {/* Recommended Plays (Action Ideas) */}
          {plays.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Tactical Plays
                </h3>
              </div>
              {plays.slice(0, 2).map((play) => (
                <div
                  key={play.findingId}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-bold text-slate-900">{play.headline}</p>
                    <span className="text-[10px] font-medium text-slate-400">
                      {play.agentEmoji ?? "💡"} {play.agentName ?? "Scout"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 line-clamp-2">
                    {play.situation}
                  </p>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2">
                    <span className="text-[11px] font-medium text-sky-700">
                      {play.options.length} route options
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setDrawerItem({
                          type: "play",
                          id: play.findingId,
                          title: play.headline,
                          authorName: play.agentName ?? "Scout",
                          authorEmoji: play.agentEmoji ?? "💡",
                          hypothesis: play.situation,
                          nextStep: "Choose an option",
                          findingId: play.findingId,
                          options: play.options.map((opt) => ({
                            id: opt.id,
                            label: opt.action,
                            explanation: opt.why,
                          })),
                        })
                      }
                      className="inline-flex items-center gap-1 text-xs font-semibold text-slate-800 hover:text-sky-600"
                    >
                      <span>Take Play</span>
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── RIGHT COLUMN: AGENT DESK (WHAT CAME BACK & IDEAS) ─────────── */}
        <div className="space-y-4 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-sky-100 text-sky-800">
                <Bot className="h-3.5 w-3.5" />
              </span>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                2. Agent Desk (Live Intelligence & Findings)
              </h2>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-medium">
              {[
                { key: "all", label: "All" },
                { key: "answers", label: `Answers (${recentResults.length})` },
                { key: "ideas", label: `Plays (${plays.length})` },
                { key: "approvals", label: `Decisions (${snapshot.decisions.length})` },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveDeskTab(key as typeof activeDeskTab)}
                  className={cn(
                    "rounded-md px-2.5 py-1 transition",
                    activeDeskTab === key
                      ? "bg-white text-slate-950 font-bold shadow-sm"
                      : "text-slate-600 hover:text-slate-900",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Cards Stream */}
          <div className="space-y-3">
            {/* 1. Recent In-App Answers (What came back from queries) */}
            {(activeDeskTab === "all" || activeDeskTab === "answers") &&
              recentResults.map((result) => (
                <article
                  key={result.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{result.authorEmoji}</span>
                      <div>
                        <span className="text-xs font-bold text-slate-900">
                          {result.authorName}
                        </span>
                        <span className="text-slate-400"> · </span>
                        <span className="text-[11px] text-slate-500">Answered Query</span>
                      </div>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-700">
                      {result.status}
                    </span>
                  </div>

                  <h4 className="mt-2 text-sm font-semibold text-slate-950">{result.title}</h4>

                  {result.resultSummary && (
                    <p className="mt-1 text-xs leading-relaxed text-slate-600 line-clamp-3">
                      {result.resultSummary.replace(/[#*`_]/g, "").slice(0, 220)}…
                    </p>
                  )}

                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
                    <span className="text-[11px] text-slate-400">
                      {new Date(result.at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setDrawerItem({
                          type: "result",
                          id: result.id,
                          title: result.title,
                          authorName: result.authorName,
                          authorEmoji: result.authorEmoji,
                          at: result.at,
                          content: result.resultSummary ?? "No text content available.",
                        })
                      }
                      className="inline-flex items-center gap-1 text-xs font-bold text-sky-600 transition hover:text-sky-800"
                    >
                      <span>Inspect Details</span>
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </article>
              ))}

            {/* 2. Decisions / Suggestions (From Decision Inbox) */}
            {(activeDeskTab === "all" || activeDeskTab === "approvals") &&
              snapshot.decisions.slice(0, 6).map((dec) => (
                <article
                  key={dec.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                        <Radar className="h-3 w-3" />
                      </span>
                      <span className="text-xs font-bold text-slate-900">{dec.ownerLabel}</span>
                      <span className="text-slate-400"> · </span>
                      <span className="text-[11px] text-slate-500">{dec.caseLabel}</span>
                    </div>
                    <Badge intent={dec.kind === "pursue" ? "success" : "warning"}>
                      {dec.kind.replace(/_/g, " ")}
                    </Badge>
                  </div>

                  <h4 className="mt-2 text-sm font-semibold text-slate-950">{dec.title}</h4>

                  <p className="mt-1 text-xs text-slate-600 line-clamp-2">
                    {dec.nextHumanStep || dec.recommendation}
                  </p>

                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
                    <span className="text-[11px] text-slate-400">
                      {dec.averageConfidence ? `${dec.averageConfidence}% confidence` : "Evidence logged"}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setDrawerItem({
                          type: "decision",
                          id: dec.id,
                          title: dec.title,
                          kind: dec.kind,
                          label: dec.caseLabel,
                          recommendation: dec.recommendation,
                          nextHumanStep: dec.nextHumanStep,
                          businessImpact: dec.businessImpact,
                          unknowns: dec.unknowns,
                          detail: dec.detail,
                          at: dec.createdAt,
                          href: dec.caseHref,
                        })
                      }
                      className="inline-flex items-center gap-1 text-xs font-bold text-sky-600 transition hover:text-sky-800"
                    >
                      <span>Inspect Details</span>
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </article>
              ))}

            {recentResults.length === 0 && snapshot.decisions.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
                <Bot className="mx-auto h-8 w-8 text-slate-400" />
                <p className="mt-2 text-sm font-medium text-slate-700">No agent results yet</p>
                <p className="mt-1 text-xs text-slate-500">
                  Ask Scout or Hanna a question in the command bar above to initiate research.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────── */}
      {/* 3. BOTTOM REFERENCE STRIP                                          */}
      {/* ────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">
          Reference Libraries:
        </span>
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="/hunter"
            className="flex items-center gap-1.5 transition hover:text-sky-700 font-medium"
          >
            <Radar className="h-3.5 w-3.5 text-slate-400" />
            <span>Signal Inbox ({archives?.projectsCount ?? 18} projects)</span>
          </Link>
          <Link
            href="/companies"
            className="flex items-center gap-1.5 transition hover:text-sky-700 font-medium"
          >
            <Building2 className="h-3.5 w-3.5 text-slate-400" />
            <span>Companies ({archives?.companiesCount ?? 174})</span>
          </Link>
          <Link
            href="/job-intake"
            className="flex items-center gap-1.5 transition hover:text-sky-700 font-medium"
          >
            <Inbox className="h-3.5 w-3.5 text-slate-400" />
            <span>Job Intake ({archives?.leadsCount ?? 34} leads)</span>
          </Link>
          <Link
            href="/workers"
            className="flex items-center gap-1.5 transition hover:text-sky-700 font-medium"
          >
            <UserRound className="h-3.5 w-3.5 text-slate-400" />
            <span>Talent Pool ({archives?.workersCount ?? 2} confirmed)</span>
          </Link>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────── */}
      {/* 4. SLIDE-OVER DRAWER (PROGRESSIVE DISCLOSURE)                       */}
      {/* ────────────────────────────────────────────────────────────────── */}
      {drawerItem && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity animate-in fade-in"
            onClick={() => setDrawerItem(null)}
          />

          {/* Slide-out Sheet */}
          <div className="absolute inset-y-0 right-0 flex max-w-full pl-10">
            <div className="w-screen max-w-2xl bg-white shadow-2xl transition-transform animate-in slide-in-from-right duration-200 flex flex-col">
              {/* Drawer Header */}
              <div className="flex items-start justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {drawerItem.type === "result"
                      ? "Agent Research Finding"
                      : drawerItem.type === "play"
                        ? "Tactical Play"
                        : "Decision Case"}
                  </span>
                  <h3 className="mt-0.5 text-base font-bold text-slate-950">
                    {drawerItem.title}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerItem(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Drawer Scrollable Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {drawerItem.type === "result" && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span>{drawerItem.authorEmoji}</span>
                      <span className="font-semibold text-slate-800">
                        {drawerItem.authorName}
                      </span>
                      <span>•</span>
                      <span>{new Date(drawerItem.at).toLocaleString()}</span>
                    </div>

                    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                      <AgentReport
                        text={drawerItem.content}
                        authorName={drawerItem.authorName}
                        authorEmoji={drawerItem.authorEmoji}
                      />
                    </div>
                  </div>
                )}

                {drawerItem.type === "decision" && (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-sky-900">
                        Recommended Human Step
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {drawerItem.nextHumanStep}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                        Commercial Impact
                      </p>
                      <p className="mt-1 text-sm text-slate-700 leading-relaxed">
                        {drawerItem.businessImpact}
                      </p>
                    </div>

                    {drawerItem.unknowns.length > 0 && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                          Unknowns & Gaps
                        </p>
                        <ul className="mt-1 list-disc pl-5 space-y-1 text-xs text-slate-600">
                          {drawerItem.unknowns.map((u, i) => (
                            <li key={i}>{u}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {drawerItem.detail && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                          Evidence Detail
                        </p>
                        <p className="mt-1 text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">
                          {drawerItem.detail}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {drawerItem.type === "play" && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span>{drawerItem.authorEmoji}</span>
                      <span className="font-semibold text-slate-800">{drawerItem.authorName}</span>
                    </div>

                    <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-amber-900">
                        Agent Hypothesis
                      </p>
                      <p className="mt-1 text-sm text-slate-800 leading-relaxed">
                        {drawerItem.hypothesis}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                        Available Options
                      </p>
                      {drawerItem.options.map((opt) => (
                        <div
                          key={opt.id}
                          className="rounded-lg border border-slate-200 p-3 hover:border-slate-300"
                        >
                          <p className="text-xs font-bold text-slate-900">{opt.label}</p>
                          <p className="mt-0.5 text-xs text-slate-600">{opt.explanation}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Drawer Footer */}
              <div className="border-t border-slate-200 bg-slate-50 px-6 py-4 flex items-center justify-between">
                <span className="text-xs text-slate-500">Press Esc to close</span>
                <button
                  type="button"
                  onClick={() => setDrawerItem(null)}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// SUBCOMPONENT: Next Move Action Panel with 1-Click Dial, Copy & Logging
// ────────────────────────────────────────────────────────────────────────────
function CockpitActionPanel({ action }: { action: NextMoveAction }) {
  const router = useRouter();
  const [copied, setCopied] = useState<string | null>(null);
  const [logging, setLogging] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isPhone = action.channelKind === "phone";
  const isEmail = action.channelKind === "email";

  async function copyToClipboard(what: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Fallback
    }
  }

  async function handleLogOutcome(outcome: "reached" | "no_answer" | "dead_end") {
    setLogging(outcome);
    setError(null);
    try {
      const res = await fetch("/api/outreach/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: action.contactId || undefined,
          leadId: action.leadId,
          channelKind: action.channelKind,
          value: action.value,
          outcome,
          content: action.script ?? undefined,
          note: note.trim() || undefined,
        }),
      });

      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Failed to log outcome.");
        return;
      }

      setNote("");
      router.refresh();
    } catch {
      setError("Network error while logging.");
    } finally {
      setLogging(null);
    }
  }

  return (
    <div className="mt-4 border-t border-slate-800/80 pt-4 space-y-3">
      {/* Target Address / Phone Line */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isPhone ? (
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
              <Phone className="h-3.5 w-3.5" />
            </span>
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/20 text-sky-400">
              <Mail className="h-3.5 w-3.5" />
            </span>
          )}
          <span className="text-xs font-mono text-slate-300">{action.value}</span>
        </div>

        <div className="flex items-center gap-2">
          {isPhone && (
            <a
              href={telHref(action.value)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500"
            >
              <Phone className="h-3 w-3" />
              <span>Dial</span>
            </a>
          )}
          {isEmail && (
            <a
              href={`mailto:${action.value}${
                action.subject ? `?subject=${encodeURIComponent(action.subject)}` : ""
              }${action.script ? `&body=${encodeURIComponent(action.script)}` : ""}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-500"
            >
              <Mail className="h-3 w-3" />
              <span>Open Mail</span>
            </a>
          )}
          {action.script && (
            <button
              type="button"
              onClick={() => copyToClipboard("script", action.script ?? "")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              {copied === "script" ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              <span>{copied === "script" ? "Copied!" : "Copy Pitch"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Matched Candidate / Offering */}
      {action.offering && (
        <div className="rounded-xl border border-sky-500/30 bg-sky-950/40 p-3 text-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-sky-300">
            Who we put forward:
          </p>
          <p className="mt-0.5 font-bold text-white">
            {action.offering.name} {action.offering.role ? `· ${action.offering.role}` : ""}
          </p>
          <p className="mt-1 text-slate-300 leading-relaxed">{action.offering.why}</p>
          {action.offering.caveats.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {action.offering.caveats.map((c, idx) => (
                <span key={idx} className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Script Text Box */}
      {action.script && (
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/80 p-3 text-xs leading-relaxed text-slate-300 font-sans">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
            Prepared Message / Phone Script:
          </p>
          <p className="whitespace-pre-wrap">{action.script}</p>
        </div>
      )}

      {/* Outcome Buttons */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="text-[11px] font-semibold text-slate-400">Log Outcome:</span>
        <button
          type="button"
          disabled={logging !== null}
          onClick={() => handleLogOutcome("reached")}
          className="rounded-lg bg-emerald-600/30 border border-emerald-500/40 px-3 py-1 text-xs font-bold text-emerald-300 hover:bg-emerald-600/50"
        >
          {logging === "reached" ? "Logging…" : "Got through"}
        </button>
        <button
          type="button"
          disabled={logging !== null}
          onClick={() => handleLogOutcome("no_answer")}
          className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-1 text-xs font-bold text-slate-300 hover:bg-slate-700"
        >
          {logging === "no_answer" ? "Logging…" : "No answer"}
        </button>
        <button
          type="button"
          disabled={logging !== null}
          onClick={() => handleLogOutcome("dead_end")}
          className="rounded-lg bg-rose-950/40 border border-rose-800/40 px-3 py-1 text-xs font-bold text-rose-300 hover:bg-rose-900/60"
        >
          {logging === "dead_end" ? "Logging…" : "Dead end"}
        </button>
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  );
}
