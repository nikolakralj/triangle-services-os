-- Enable in-app send on the CEO mailbox only. Other connected mailboxes
-- stay ingest-only (can_send remains false).
--
-- DO NOT APPLY until the operator says yes. Preview first.
--
-- Also attaches owner_user_id from profiles when the mailbox address
-- matches a signed-in profile, so send cannot fall through to a colleague.

-- Preview
select
  ma.id,
  ma.email_address,
  ma.owner_user_id,
  ma.can_send,
  p.id as profile_user_id,
  p.email as profile_email
from public.mail_accounts ma
left join public.profiles p
  on lower(p.email) = lower(ma.email_address)
where lower(ma.email_address) in (
  'nikola.kralj@triangle-services.com',
  'nikola.kralj86@gmail.com'
);

-- Apply
update public.mail_accounts ma
set
  can_send = true,
  owner_user_id = coalesce(ma.owner_user_id, p.id)
from public.profiles p
where lower(p.email) = lower(ma.email_address)
  and lower(ma.email_address) in (
    'nikola.kralj@triangle-services.com',
    'nikola.kralj86@gmail.com'
  );

notify pgrst, 'reload schema';
