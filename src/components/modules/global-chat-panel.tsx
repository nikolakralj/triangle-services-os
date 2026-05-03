"use client";

import { useEffect, useRef, useState } from "react";
import {
  Send,
  Loader2,
  Sparkles,
  Building2,
  Users,
  Package,
  Globe,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  PlusCircle,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ToolCallRecord {
  name: string;
  arguments: Record<string, unknown>;
  result: { ok: boolean; id?: string; error?: string; [key: string]: any };
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
  return `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const TOOL_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  search_crm_companies: { label: "CRM Search", icon: Search, color: "text-amber-600 bg-amber-50" },
  search_talent: { label: "Talent Search", icon: Users, color: "text-sky-600 bg-sky-50" },
  create_crm_lead: { label: "Lead Created", icon: PlusCircle, color: "text-emerald-600 bg-emerald-50" },
  web_search: { label: "Web Intelligence", icon: Globe, color: "text-violet-600 bg-violet-50" },
};

function ToolCallChip({ call }: { call: ToolCallRecord }) {
  const meta = TOOL_LABELS[call.name] ?? { label: call.name, icon: Sparkles, color: "text-slate-600 bg-slate-50" };
  const Icon = meta.icon;

  let summary = "";
  if (call.name === "search_crm_companies") {
    summary = `Query: ${String(call.arguments.query ?? "")}`;
  } else if (call.name === "search_talent") {
    const skills = Array.isArray(call.arguments.skills) ? call.arguments.skills.join(", ") : "";
    summary = `Skills: ${skills}`;
  } else if (call.name === "create_crm_lead") {
    summary = String(call.arguments.name ?? "");
  }

  const ok = call.result.ok !== false;

  return (
    <div className={cn("flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-xs", meta.color)}>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <span className="font-semibold">{meta.label}:</span>{" "}
        <span className="font-normal">{summary || (ok ? "completed" : call.result.error)}</span>
      </div>
    </div>
  );
}

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
      <div className={cn("max-w-[90%] space-y-2 rounded-2xl px-4 py-2.5 text-sm leading-6 shadow-sm",
        isUser ? "bg-slate-900 text-white" : "bg-white text-slate-800 border border-slate-200")}>
        {!isUser && (
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            <Sparkles className="h-3 w-3 text-sky-500" />
            Global Scout
          </div>
        )}
        {message.content && <div className="whitespace-pre-wrap">{message.content}</div>}
        {message.toolCalls.length > 0 && (
          <div className="space-y-1 pt-1">
            {message.toolCalls.map((call, i) => <ToolCallChip key={i} call={call} />)}
          </div>
        )}
        {message.citations.length > 0 && (
          <div className="border-t border-slate-100 pt-2">
            <button onClick={() => setShowCitations(!showCitations)} className="flex items-center gap-1 text-[10px] font-medium text-slate-400 hover:text-slate-600">
              {showCitations ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {message.citations.length} Source{message.citations.length === 1 ? "" : "s"}
            </button>
            {showCitations && (
              <div className="mt-2 space-y-1">
                {message.citations.slice(0, 8).map((c, i) => (
                  <a key={i} href={c.source_url} target="_blank" rel="noopener noreferrer" className="block truncate text-[10px] text-sky-600 hover:underline">
                    {c.title || c.source_url}
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

export function GlobalChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      try {
        // Use a default global identifier or just rely on the API finding the last global chat
        const res = await fetch("/api/ai/chat?global=true");
        // Note: I haven't implemented GET in /api/ai/chat yet, but I'll add it.
        // For now, let's just assume a clean start or implement GET soon.
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages || []);
          setConversationId(data.conversationId);
        }
      } catch {} finally { setHistoryLoading(false); }
    }
    load();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, loading]);

  const send = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || loading) return;
    setInput("");
    setLoading(true);

    const tempId = makeClientMessageId();
    setMessages(prev => [...prev, { id: tempId, role: "user", content: text, toolCalls: [], citations: [], createdAt: new Date().toISOString() }]);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversationId: conversationId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessages(prev => [...prev, { id: data.messageId || makeClientMessageId(), role: "assistant", content: data.text, toolCalls: data.toolCalls || [], citations: data.citations || [], createdAt: new Date().toISOString() }]);
      setConversationId(data.conversationId);
    } catch (err: any) {
      setMessages(prev => [...prev, { id: makeClientMessageId(), role: "system_note", content: err.message, toolCalls: [], citations: [], createdAt: new Date().toISOString() }]);
    } finally { setLoading(false); }
  };

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {historyLoading ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Initializing Scout...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
            <div className="rounded-2xl bg-white p-4 shadow-xl shadow-sky-100">
              <Sparkles className="h-10 w-10 text-sky-500" />
            </div>
            <div className="max-w-sm space-y-2">
              <h2 className="text-xl font-bold text-slate-900">Placement Orchestrator</h2>
              <p className="text-sm text-slate-500 leading-relaxed">
                Search for new contractors, agencies, or EPCs globally. 
                I can match findings with our current worker pool and create CRM leads.
              </p>
            </div>
            <div className="grid w-full max-w-md gap-2">
              {["Find EPCs in Poland for data center projects.", "Who is the main contractor for the STACK Milan expansion?", "Search for agency partners in Germany and matching German-speaking welders."].map(p => (
                <button key={p} onClick={() => send(p)} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-xs font-medium text-slate-700 hover:border-sky-400 hover:bg-sky-50 transition-all shadow-sm">
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map(m => <MessageBubble key={m.id} message={m} />)
        )}
        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-medium text-slate-600 shadow-sm">
              <div className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-400" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-500 [animation-delay:0.2s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-600 [animation-delay:0.4s]" />
              </div>
              Orchestrating placement...
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 bg-white p-4 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.05)]">
        <div className="flex items-end gap-3">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
            disabled={loading}
            placeholder="Type your command (e.g. 'Hunt for data center EPCs in Madrid')..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-sky-50 transition-all"
          />
          <button
            onClick={() => send()}
            disabled={loading || !input.trim()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-lg hover:bg-slate-800 disabled:bg-slate-200 transition-all"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
