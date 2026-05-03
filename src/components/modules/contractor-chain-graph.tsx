"use client";

import React, { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Building2, UserCircle2, Package, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContractorChainNodeRow, ChainRole } from "@/lib/data/contractor-chain-shared";
import { CHAIN_ROLE_LABELS } from "@/lib/data/contractor-chain-shared";
import type { ResearchSuggestionRow } from "@/lib/data/research";
import type { ProjectPackageRow } from "@/lib/data/project-packages";

// ─── Custom Node Components ────────────────────────────────────────────────

const ChainNode = ({ data }: { data: any }) => {
  const isSuggestion = data.isSuggestion;
  
  return (
    <div className={cn(
      "group relative flex w-64 flex-col rounded-lg border bg-white p-3 shadow-sm transition-all hover:shadow-md",
      isSuggestion ? "border-dashed border-sky-300 bg-sky-50/30" : "border-slate-200"
    )}>
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !bg-slate-300" />
      
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
            isSuggestion ? "bg-sky-100 text-sky-600" : "bg-slate-100 text-slate-600"
          )}>
            {data.role === "owner" || data.role === "developer" ? (
              <UserCircle2 className="h-5 w-5" />
            ) : (
              <Building2 className="h-5 w-5" />
            )}
          </div>
          <div className="flex flex-col overflow-hidden">
            <span className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {data.roleLabel}
            </span>
            <span className="truncate text-sm font-semibold text-slate-900">
              {data.companyName || "Unknown"}
            </span>
          </div>
        </div>
        
        {isSuggestion && (
          <div className="flex h-5 items-center rounded-full bg-sky-100 px-1.5 text-[9px] font-bold text-sky-700">
            AI
          </div>
        )}
      </div>
      
      {data.confidence && (
        <div className="mt-2 flex items-center gap-1.5">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div 
              className="h-full bg-sky-500 transition-all" 
              style={{ width: `${data.confidence}%` }} 
            />
          </div>
          <span className="text-[10px] font-medium text-slate-500">{data.confidence}%</span>
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !bg-slate-300" />
    </div>
  );
};

const PackageNode = ({ data }: { data: any }) => {
  return (
    <div className="flex w-56 flex-col rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 shadow-sm">
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !bg-emerald-300" />
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-100 text-emerald-600">
          <Package className="h-4 w-4" />
        </div>
        <span className="text-sm font-semibold text-emerald-900 line-clamp-1">{data.title}</span>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-emerald-700 line-clamp-2">
        {data.summary}
      </p>
    </div>
  );
};

const nodeTypes = {
  chain: ChainNode,
  package: PackageNode,
};

// ─── Main Graph Component ──────────────────────────────────────────────────

export function ContractorChainGraph({
  suggestions,
  savedChainNodes,
  dbPackages,
}: {
  suggestions: ResearchSuggestionRow[];
  savedChainNodes: ContractorChainNodeRow[];
  dbPackages: ProjectPackageRow[];
}) {
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    
    // 1. Group saved nodes by role
    const nodesByRole: Record<string, ContractorChainNodeRow[]> = {};
    savedChainNodes.forEach(n => {
      if (!nodesByRole[n.role]) nodesByRole[n.role] = [];
      nodesByRole[n.role].push(n);
    });

    // 2. Add suggestions for missing roles
    const pendingNodes = suggestions.filter(s => s.suggestion_type === "chain_node" && s.status === "pending");
    pendingNodes.forEach(s => {
      const payload = s.payload_json as any;
      const role = payload.role;
      // Simple heuristic: if we don't have a saved node for this role, or if this is a different company
      if (!nodesByRole[role]) nodesByRole[role] = [];
      // (Actually, show all suggestions for now to be complete)
    });

    // 3. Define the vertical hierarchy
    const roles: ChainRole[] = ["owner", "developer", "epc", "gc", "mep", "electrical"];
    
    let y = 50;
    const xCenter = 400;
    const horizontalSpacing = 280;
    
    const roleToNodeIds: Record<string, string[]> = {};

    roles.forEach((role, roleIndex) => {
      const saved = nodesByRole[role] || [];
      const suggested = pendingNodes.filter(s => (s.payload_json as any).role === role);
      
      const totalInRole = saved.length + suggested.length;
      if (totalInRole === 0) return;

      const xStart = xCenter - ((totalInRole - 1) * horizontalSpacing) / 2;
      
      roleToNodeIds[role] = [];

      // Add Saved Nodes
      saved.forEach((node, i) => {
        const id = `saved-${node.id}`;
        nodes.push({
          id,
          type: "chain",
          position: { x: xStart + i * horizontalSpacing, y },
          data: {
            role,
            roleLabel: CHAIN_ROLE_LABELS[role],
            companyName: node.company_name,
            confidence: node.confidence,
            isSuggestion: false,
          },
        });
        roleToNodeIds[role].push(id);
      });

      // Add Suggested Nodes
      suggested.forEach((s, i) => {
        const id = `suggested-${s.id}`;
        const payload = s.payload_json as any;
        nodes.push({
          id,
          type: "chain",
          position: { x: xStart + (saved.length + i) * horizontalSpacing, y },
          data: {
            role,
            roleLabel: CHAIN_ROLE_LABELS[role],
            companyName: payload.company,
            confidence: s.confidence,
            isSuggestion: true,
          },
        });
        roleToNodeIds[role].push(id);
      });

      // Connect to previous level
      if (roleIndex > 0) {
        const prevRole = roles[roleIndex - 1];
        const prevIds = roleToNodeIds[prevRole];
        if (prevIds) {
          roleToNodeIds[role].forEach(currId => {
            prevIds.forEach(prevId => {
              edges.push({
                id: `e-${prevId}-${currId}`,
                source: prevId,
                target: currId,
                animated: currId.startsWith("suggested"),
                style: { stroke: "#cbd5e1", strokeWidth: 1.5 },
              });
            });
          });
        }
      }

      y += 180;
    });

    // 4. Add Packages at the bottom
    const lastRoleId = roles.reverse().find(r => roleToNodeIds[r] && roleToNodeIds[r].length > 0);
    if (lastRoleId && dbPackages.length > 0) {
        const xStart = xCenter - ((dbPackages.length - 1) * horizontalSpacing) / 2;
        dbPackages.forEach((pkg, i) => {
            const id = `pkg-${pkg.id}`;
            nodes.push({
                id,
                type: "package",
                position: { x: xStart + i * horizontalSpacing, y },
                data: { title: pkg.title, summary: pkg.summary },
            });

            // Connect to parent nodes (if linked)
            if (pkg.contractor_node_id) {
                const parentId = `saved-${pkg.contractor_node_id}`;
                edges.push({
                    id: `e-pkg-${pkg.id}`,
                    source: parentId,
                    target: id,
                    style: { stroke: "#10b981", strokeWidth: 2 },
                });
            } else {
                // Connect to all in the last discovered level
                roleToNodeIds[lastRoleId].forEach(parentId => {
                    edges.push({
                        id: `e-pkg-${parentId}-${pkg.id}`,
                        source: parentId,
                        target: id,
                        style: { stroke: "#10b981", strokeWidth: 1, strokeDasharray: "5,5" },
                    });
                });
            }
        });
    }

    return { nodes, edges };
  }, [suggestions, savedChainNodes, dbPackages]);

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        className="bg-slate-50/50"
      >
        <Background color="#cbd5e1" gap={20} size={1} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
