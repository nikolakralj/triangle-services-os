-- ============================================================
-- Migration 005: Conversational Research Agent (idempotent)
-- ============================================================
-- Adds chat-style memory so the research agent can carry on a
-- multi-turn conversation per project, remembering past
-- accept/reject decisions across sessions.

-- ── research_conversations ────────────────────────────────────────────────────

create table if not exists public.research_conversations (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  project_id      uuid not null references public.discovered_projects(id) on delete cascade,
  started_by      uuid references auth.users(id) on delete set null,
  title           text,
  -- Periodically refreshed LLM-generated summary of older messages.
  -- Used to keep context windows small while preserving long-term memory.
  summary         text,
  message_count   integer not null default 0,
  last_active_at  timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create index if not exists research_conversations_project_idx
  on public.research_conversations (project_id);
create index if not exists research_conversations_org_idx
  on public.research_conversations (org_id);
create index if not exists research_conversations_active_idx
  on public.research_conversations (project_id, last_active_at desc);

alter table public.research_conversations enable row level security;

drop policy if exists "org members can view research_conversations"   on public.research_conversations;
drop policy if exists "org members can insert research_conversations" on public.research_conversations;
drop policy if exists "org members can update research_conversations" on public.research_conversations;

create policy "org members can view research_conversations"
  on public.research_conversations for select
  using (org_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid() and status = 'active'
  ));

create policy "org members can insert research_conversations"
  on public.research_conversations for insert
  with check (org_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid() and status = 'active'
  ));

create policy "org members can update research_conversations"
  on public.research_conversations for update
  using (org_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid() and status = 'active'
  ));

-- ── research_messages ─────────────────────────────────────────────────────────
-- Individual messages in a conversation. Roles loosely follow the OpenAI /
-- Anthropic chat conventions:
--   user:        text typed by a human
--   assistant:   reply from the LLM (may include tool calls)
--   tool_result: structured output from a tool the assistant called
--   system_note: internal record (e.g. "research run started", "5 suggestions
--                created"). Not sent to the LLM but shown in the UI.

do $$ begin
  create type public.research_message_role as enum (
    'user', 'assistant', 'tool_result', 'system_note'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.research_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.research_conversations(id) on delete cascade,
  org_id           uuid not null references public.organizations(id) on delete cascade,
  role             public.research_message_role not null,
  content          text,                         -- plain text portion (may be null for tool calls)
  tool_calls       jsonb not null default '[]',  -- [{ name, args, result_id?, suggestion_id? }]
  citations        jsonb not null default '[]',  -- [{ source_url, title, snippet }]
  -- Token usage from this message's API call (for cost tracking)
  prompt_tokens     integer,
  completion_tokens integer,
  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users(id) on delete set null
);

create index if not exists research_messages_conversation_idx
  on public.research_messages (conversation_id, created_at);
create index if not exists research_messages_org_idx
  on public.research_messages (org_id);

alter table public.research_messages enable row level security;

drop policy if exists "org members can view research_messages"   on public.research_messages;
drop policy if exists "org members can insert research_messages" on public.research_messages;

create policy "org members can view research_messages"
  on public.research_messages for select
  using (org_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid() and status = 'active'
  ));

create policy "org members can insert research_messages"
  on public.research_messages for insert
  with check (org_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid() and status = 'active'
  ));

-- ── Trigger: keep message_count + last_active_at fresh ────────────────────────

create or replace function public.bump_research_conversation_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.research_conversations
     set message_count  = message_count + 1,
         last_active_at = now()
   where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists trg_bump_research_conversation
  on public.research_messages;

create trigger trg_bump_research_conversation
  after insert on public.research_messages
  for each row
  execute function public.bump_research_conversation_activity();
