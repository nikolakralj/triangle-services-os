"use client";

/**
 * ResearchChatPanel — conversational AI research agent for a single project.
 *
 * Replaces the old "Run AI Research" button. The user types a message
 * (e.g. "Find Eclairion's MEP subcontractors") and the agent:
 *   - Searches the web
 *   - Proposes new chain nodes / contacts / packages / notes via tools
 *   - Replies in chat with what it found
 *
 * Memory is persistent: opening this panel later resumes the same
 * conversation and the agent already knows what was accepted/rejected.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Send,
  Loader2,
  Sparkles,
  Building2,
  User,
  Package,
  FileText,
  Globe,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ToolCallRecord {
  name: string;
  arguments: Record<string, unknown>;
  result: { ok: boolean; suggestion_id?: string; error?: string };
}

interface Citation {
  source_url: string;
  title?: string;
  snippet?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool_result" | "system_note";
  content: string | null;
  toolCalls: ToolCallRecord[];
  citations: Citation[];
  createdAt: string;
}

function makeClientMessageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `temp-${crypto.randomUUID()}`;
  }
  return `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const TOOL_LABELS: Record<string, { label: string; icon: typeof Building2 }> = {
  propose_chain_node: { label: "Proposed contractor", icon: Building2 },
  propose_buyer_contact: { label: "Proposed buyer contact", icon: User },
  propose_package: { label: "Proposed package", icon: Package },
  add_note: { label: "Added note", icon: FileText },
  web_search: { label: "Searched web", icon: Globe },
};

// ── Tool-call summary chip ───────────────────────────────────────────────────

function ToolCallChip({ call }: { call: ToolCallRecord }) {
  const meta = TOOL_LABELS[call.name] ?? {
    label: call.name,
    icon: Sparkles,
  };
  const Icon = meta.icon;

  let summary = "";
  if (call.name === "propose_chain_node") {
    summary = `${String(call.arguments.company ?? "?")} — ${String(call.arguments.role ?? "?").toUpperCase()}`;
  } else if (call.name === "propose_buyer_contact") {
    summary = `${String(call.arguments.name ?? "?")} @ ${String(call.arguments.company ?? "?")}`;
  } else if (call.name === "propose_package") {
    summary = `${String(call.arguments.package_type ?? "?")} → ${String(call.arguments.likely_buyer ?? "?")}`;
  } else if (call.name === "add_note") {
    summary = String(call.arguments.content ?? "").substring(0, 60);
  } else {
    summary = "";
  }

  const ok = call.result.ok;

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-xs",
        ok
          ? "bg-emerald-50 text-emerald-800"
          : "bg-rose-50 text-rose-800",
      )}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <span className="font-semibold">{meta.label}:</span>{" "}
        <span className="font-normal">{summary || (ok ? "ok" : call.result.error)}</span>
      </div>
    </div>
  );
}

// ── Single message bubble ────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const [showCitations, setShowCitations] = useState(false);

  if (message.role === "system_note") {
    return (
      <div className="flex justify-center">
        <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[11px] text-slate-500">
          <AlertCircle className="h-3 w-3" />
          {message.content}
        </div>
      </div>
    );
  }

  const isUser = message.role === "user";

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[88%] space-y-2 rounded-2xl px-4 py-2.5 text-sm leading-6 shadow-sm",
          isUser
            ? "bg-sky-600 text-white"
            : "bg-white text-slate-800 border border-slate-200",
        )}
      >
        {!isUser && (
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <Sparkles className="h-3 w-3" />
            Research Agent
          </div>
        )}

        {message.content && (
          <div className="whitespace-pre-wrap">{message.content}</div>
        )}

        {message.toolCalls.length > 0 && (
          <div className="space-y-1 pt-1">
            {message.toolCalls.map((call, i) => (
              <ToolCallChip key={i} call={call} />
            ))}
          </div>
        )}

        {message.citations.length > 0 && (
          <div className="border-t border-slate-100 pt-2">
            <button
              onClick={() => setShowCitations(!showCitations)}
              className="flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-700"
            >
              {showCitations ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
              {message.citations.length} source
              {message.citations.length === 1 ? "" : "s"}
            </button>
            {showCitations && (
              <div className="mt-2 space-y-1">
                {message.citations.slice(0, 12).map((c, i) => (
                  <a
                    key={i}
                    href={c.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-[11px] text-sky-700 hover:underline"
                    title={c.snippet ?? c.source_url}
                  >
                    {c.title ?? c.source_url}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────

const SUGGESTED_PROMPTS = [
  "Map the contractor chain — owner, GC, MEP, electrical, commissioning.",
  "Find buyer contacts at the GC and MEP packages on LinkedIn.",
  "What labor packages are most likely to be subcontracted?",
  "Search for recent news about this project.",
];

export function ResearchChatPanel({
  projectId,
  compact = false,
  onError,
}: {
  projectId: string;
  compact?: boolean;
  onError?: (message: string | null) => void;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load existing conversation history on mount
  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      try {
        const res = await fetch(
          `/api/research/chat?projectId=${encodeURIComponent(projectId)}`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as {
          conversationId: string;
          messages: ChatMessage[];
        };
        if (cancelled) return;
        setConversationId(data.conversationId);
        setMessages(data.messages ?? []);
      } catch (err) {
        if (!cancelled) {
          const message = normalizeErrorMessage(
            err instanceof Error ? err.message : "Failed to load history",
          );
          setError(message);
          onError?.(message);
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }
    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [onError, projectId]);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, loading]);

  const send = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || loading) return;

    setError(null);
    onError?.(null);
    setInput("");
    setLoading(true);

    // Optimistic user message
    const tempId = makeClientMessageId();
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        role: "user",
        content: text,
        toolCalls: [],
        citations: [],
        createdAt: new Date().toISOString(),
      },
    ]);

    try {
      const res = await fetch("/api/research/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          conversationId: conversationId ?? undefined,
          message: text,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");

      setConversationId(data.conversationId);
      setMessages((prev) => {
        const alreadyHasAssistant = prev.some((m) => m.id === data.messageId);
        if (alreadyHasAssistant) return prev;
        return [
          ...prev,
          {
            id: data.messageId,
            role: "assistant",
            content: data.text ?? "",
            toolCalls: data.toolCalls ?? [],
            citations: data.citations ?? [],
            createdAt: new Date().toISOString(),
          },
        ];
      });

      // If suggestions were created, refresh the page so the suggestions panel updates
      if (data.suggestionsCreated > 0) {
        router.refresh();
      }
    } catch (err) {
      const message = normalizeErrorMessage(err instanceof Error ? err.message : "Error");
      setError(message);
      onError?.(message);
      // Remove the optimistic user message so they can retry
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInput(text);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className={cn("flex flex-col rounded-2xl border border-slate-200 bg-slate-50", compact ? "h-[420px]" : "h-[600px]")}>
      {/* Header */}
      <div className="flex items-center justify-between rounded-t-2xl border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-violet-500 text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Research Agent</h3>
            <p className="text-[11px] text-slate-500">
              Remembers what you accepted, rejected, and asked about.
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {historyLoading ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading history...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="rounded-full bg-white p-3 shadow-sm">
              <Sparkles className="h-6 w-6 text-violet-500" />
            </div>
            <div className="max-w-xs space-y-1">
              <p className="text-sm font-semibold text-slate-700">
                Tell the agent what to research
              </p>
              <p className="text-xs text-slate-500">
                It can search the web, propose chain nodes and buyer contacts,
                and remembers your past decisions.
              </p>
            </div>
            <div className="grid w-full max-w-md gap-1.5">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => send(prompt)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-700 hover:border-sky-300 hover:bg-sky-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-500 shadow-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Researching... (this can take 20-60 seconds)
            </div>
          </div>
        )}
      </div>

      {error && !compact && (
        <div className="border-t border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="rounded-b-2xl border-t border-slate-200 bg-white p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading || historyLoading}
            placeholder="Ask the agent to research something..."
            rows={2}
            className="flex-1 resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:bg-slate-50"
          />
          <button
            onClick={() => send()}
            disabled={loading || historyLoading || !input.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-white shadow-sm hover:bg-sky-700 disabled:bg-slate-300"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-slate-400">
          Enter to send · Shift+Enter for new line · Findings appear in Research suggestions below
        </p>
      </div>
    </div>
  );
}
  function normalizeErrorMessage(message: string) {
    if (message.includes("Duplicate item found with id")) {
      return "Duplicate tool call detected in this run. Retry once; if it repeats, run with a shorter prompt.";
    }
    return message;
  }
