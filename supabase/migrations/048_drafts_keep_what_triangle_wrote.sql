-- ============================================================
-- Migration 048: keep a draft as Triangle wrote it
-- ============================================================
-- A person edits a draft before sending it, and the edit overwrote the only
-- copy of what Triangle wrote. commercial_actions has ai_draft and
-- final_content for exactly this, but by the time a send was recorded the
-- draft row already held the final text, so both columns got the same words
-- and nothing could show what the person changed.
--
-- Two columns on each drafts table, written when the draft is created and
-- never touched by an edit. Recording the send copies them into
-- commercial_actions.ai_draft; body stays what the person kept.
--
-- Existing drafts are filled only where the row was never updated after it
-- was created (both tables have an updated_at trigger), so a draft somebody
-- already edited stays unknown rather than being labelled as Triangle's.

alter table public.lead_reply_drafts
  add column if not exists ai_subject text,
  add column if not exists ai_body text;

alter table public.outreach_drafts
  add column if not exists ai_subject text,
  add column if not exists ai_body text;

update public.lead_reply_drafts
   set ai_subject = subject,
       ai_body = body
 where ai_body is null
   and status = 'draft'
   and updated_at <= created_at + interval '2 seconds';

update public.outreach_drafts
   set ai_subject = subject,
       ai_body = body
 where ai_body is null
   and status = 'draft'
   and updated_at <= created_at + interval '2 seconds';

notify pgrst, 'reload schema';
