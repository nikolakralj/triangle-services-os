-- ============================================================
-- Migration 014: Encrypted mailbox credentials + custom IMAP hosts
-- ============================================================
-- Replaces the env-var-per-user approach, which didn't scale past two
-- people and forced one person's password through whoever managed the
-- deployment environment.
--
-- Now: each mailbox owner enters their own password in the app. It is
-- encrypted server-side with AES-256-GCM (key in ENCRYPTION_KEY, never
-- in the database) before being written here, and is never read back
-- out to any client.
--
-- credential_ref is KEPT so existing env-var accounts keep working;
-- the resolver checks the encrypted column first, then falls back.

alter table public.mail_accounts
  add column if not exists credential_encrypted text,
  -- non-Gmail hosts (e.g. the triangle-services.com mail server)
  add column if not exists imap_host text,
  add column if not exists imap_port integer,
  -- who last set the credential, and when
  add column if not exists credential_set_at timestamptz,
  add column if not exists credential_set_by uuid references auth.users(id) on delete set null;

comment on column public.mail_accounts.credential_encrypted is
  'AES-256-GCM ciphertext (base64 iv:tag:data). Never returned to clients.';
comment on column public.mail_accounts.credential_ref is
  'Legacy: name of an env var holding the password. Superseded by credential_encrypted.';

notify pgrst, 'reload schema';
