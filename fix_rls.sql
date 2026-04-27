-- Run this in the Supabase SQL Editor
-- This ensures the RLS policies for companies are properly created
-- It appears the initial migration might have failed silently on these tables

do $$
declare
  t text;
begin
  foreach t in array array[
    'pipeline_stages','opportunities','workers','document_templates','document_checklist_items',
    'activities','ai_generations','import_batches','import_rows'
  ]
  loop
    begin
      execute format('drop policy if exists "members can read %I" on public.%I', t, t);
      execute format('drop policy if exists "admin partner can write %I" on public.%I', t, t);
      execute format('drop policy if exists "admin partner can update %I" on public.%I', t, t);
      execute format('drop policy if exists "admin can delete %I" on public.%I', t, t);
      
      execute format('create policy "members can read %I" on public.%I for select using (public.is_org_member(organization_id))', t, t);
      execute format('create policy "admin partner can write %I" on public.%I for insert with check (public.current_user_role(organization_id) in (''admin'',''partner''))', t, t);
      execute format('create policy "admin partner can update %I" on public.%I for update using (public.current_user_role(organization_id) in (''admin'',''partner'')) with check (public.current_user_role(organization_id) in (''admin'',''partner''))', t, t);
      execute format('create policy "admin can delete %I" on public.%I for delete using (public.current_user_role(organization_id) = ''admin'')', t, t);
    exception when others then
      raise notice 'Skipped %', t;
    end;
  end loop;
end;
$$;

-- Companies
drop policy if exists "members can read companies" on public.companies;
drop policy if exists "admin partner researcher can write companies" on public.companies;
drop policy if exists "admin partner researcher can update companies" on public.companies;
drop policy if exists "admin can delete companies" on public.companies;

create policy "members can read companies" on public.companies
for select using (public.is_org_member(organization_id));

create policy "admin partner researcher can write companies" on public.companies
for insert with check (public.current_user_role(organization_id) in ('admin','partner','researcher'));

create policy "admin partner researcher can update companies" on public.companies
for update using (public.current_user_role(organization_id) in ('admin','partner','researcher'))
with check (public.current_user_role(organization_id) in ('admin','partner','researcher'));

create policy "admin can delete companies" on public.companies
for delete using (public.current_user_role(organization_id) = 'admin');

-- Contacts
drop policy if exists "members can read contacts" on public.contacts;
drop policy if exists "admin partner researcher can write contacts" on public.contacts;
drop policy if exists "admin partner researcher can update contacts" on public.contacts;
drop policy if exists "admin can delete contacts" on public.contacts;

create policy "members can read contacts" on public.contacts
for select using (public.is_org_member(organization_id));

create policy "admin partner researcher can write contacts" on public.contacts
for insert with check (public.current_user_role(organization_id) in ('admin','partner','researcher'));

create policy "admin partner researcher can update contacts" on public.contacts
for update using (public.current_user_role(organization_id) in ('admin','partner','researcher'))
with check (public.current_user_role(organization_id) in ('admin','partner','researcher'));

create policy "admin can delete contacts" on public.contacts
for delete using (public.current_user_role(organization_id) = 'admin');
