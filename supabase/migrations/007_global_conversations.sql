-- ============================================================
-- Migration 007: Allow Global (Project-less) Conversations
-- ============================================================

-- 1. Make project_id nullable in research_conversations
alter table public.research_conversations 
  alter column project_id drop not null;

-- 2. Update the index to handle nulls efficiently
drop index if exists research_conversations_project_idx;
create index research_conversations_project_idx on public.research_conversations (project_id) where project_id is not null;

-- 3. Ensure the Global Scout conversation uses NULL instead of the nil UUID
-- (This is cleaner than trying to find a non-existent project)
