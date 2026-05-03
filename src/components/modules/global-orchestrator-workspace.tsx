"use client";

import { useState } from "react";
import { 
  Sparkles, 
  Target, 
  Users, 
  TrendingUp, 
  ArrowRight,
  Zap
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GlobalChatPanel } from "./global-chat-panel";
import type { Company, Contact, Opportunity } from "@/lib/types";

export function GlobalOrchestratorWorkspace({
  companies,
  contacts,
  opportunities
}: {
  companies: Company[];
  contacts: Contact[];
  opportunities: Opportunity[];
}) {
  return (
    <div className="flex h-[calc(100vh-140px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      {/* Left Panel: The Orchestrator Chat */}
      <div className="flex w-3/5 flex-col border-r border-slate-200">
        <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-4 bg-slate-50/50">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Zap className="h-5 w-5 text-sky-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Placement Command Center</h2>
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-tight">Agent Active: Global Scout</span>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <GlobalChatPanel />
        </div>
      </div>

      {/* Right Panel: Intelligence Deck */}
      <div className="w-2/5 overflow-y-auto bg-slate-50/30 p-6">
        <div className="space-y-8">
          {/* Stats Bar */}
          <div className="grid grid-cols-3 gap-4">
            <StatCard icon={Target} label="Leads" value={companies.length} color="text-amber-600" />
            <StatCard icon={Users} label="Talent" value="240+" color="text-sky-600" />
            <StatCard icon={TrendingUp} label="Yield" value="12%" color="text-emerald-600" />
          </div>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Recent Correlations</h3>
              <Sparkles className="h-4 w-4 text-sky-500" />
            </div>
            
            <div className="space-y-3">
              {companies.slice(0, 3).map((company, i) => (
                <CorrelationCard 
                  key={company.id}
                  title={company.name}
                  subtitle={company.companyType || "Industrial"}
                  tag="Lead Match"
                  confidence={85 - (i * 10)}
                />
              ))}
              
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
                <p className="text-xs font-medium text-slate-400">
                  Ask the Orchestrator to correlate workers <br/> with recent market wins to see more here.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-4">
             <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Suggested Actions</h3>
             <div className="space-y-2">
                <ActionItem label="Map STACK Milan GC and find Electrical package" />
                <ActionItem label="Audit welding certifications in Polish worker pool" />
                <ActionItem label="Draft outreach for Eclairion expansion leads" />
             </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any, label: string, value: string | number, color: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={cn("mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50", color)}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
      <p className="text-lg font-black text-slate-900">{value}</p>
    </div>
  );
}

function CorrelationCard({ title, subtitle, tag, confidence }: { title: string, subtitle: string, tag: string, confidence: number }) {
  return (
    <div className="group relative rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-sky-200 transition-all cursor-pointer overflow-hidden">
      <div className="absolute right-0 top-0 h-full w-1 bg-sky-500 opacity-0 group-hover:opacity-100 transition-all" />
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-1 inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700">
            {tag}
          </div>
          <h4 className="truncate text-sm font-bold text-slate-900">{title}</h4>
          <p className="truncate text-xs text-slate-500">{subtitle}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold text-slate-400 uppercase">Match</p>
          <p className="text-sm font-black text-emerald-600">{confidence}%</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-slate-50 pt-3">
        <span className="text-[10px] font-medium text-slate-500">View Details</span>
        <ArrowRight className="h-3 w-3 text-slate-400 group-hover:text-sky-500 transform group-hover:translate-x-1 transition-all" />
      </div>
    </div>
  );
}

function ActionItem({ label }: { label: string }) {
  return (
    <button className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 transition-all group">
      <span className="truncate pr-4">{label}</span>
      <ArrowRight className="h-3 w-3 shrink-0 text-slate-300 group-hover:text-slate-900 transition-all" />
    </button>
  );
}
