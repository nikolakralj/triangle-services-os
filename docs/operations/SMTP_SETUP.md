# Email setup (Resend + Supabase SMTP)

Why: Supabase's built-in email allows only a few messages per hour and is
explicitly not for production. It has already cost real time — a login lockout
that needed an admin password reset, because magic links hit the rate limit.
More importantly, **Ralph's invite will silently fail** without this.

Resend's free tier is 3,000 emails/month and 100/day. Triangle sends a handful
of logins and invites — this is many times more than enough, indefinitely.

Steps marked **YOU** need a human: an account, a DNS change, or a secret.

---

## The DNS decision — read this first

Your domain already runs its own mail server:

```
MX  → triangle-services.com          (self-hosted)
SPF → v=spf1 ip4:185.199.38.8 +a +mx +ip4:195.189.82.66 ~all
```

**Do not add Resend to that SPF record.** Editing the SPF of a live mail
domain risks your normal company email landing in spam.

Use a **subdomain** instead — `send.triangle-services.com`. It is currently
unused (verified: NXDOMAIN), it gets its own SPF and DKIM, and your existing
mail setup is untouched. This is also standard practice: keep transactional
email on a separate sending identity from human mail, so a deliverability
problem in one never damages the other.

Auth emails will then come from something like
`noreply@send.triangle-services.com`.

---

## 1. Create the Resend account — **YOU**

<https://resend.com> → sign up (free tier, no card).

## 2. Add the sending domain — **YOU**

Resend → **Domains** → **Add Domain** → enter:

```
send.triangle-services.com
```

Resend shows 3 DNS records to add (roughly):

| Type | Name | Value |
|---|---|---|
| MX | `send` | `feedback-smtp.eu-west-1.amazonses.com` (priority 10) |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` |
| TXT | `resend._domainkey.send` | a long `p=...` DKIM key |

Add them at your DNS provider (wherever `triangle-services.com` is managed).

**Pick the EU region** in Resend when creating the domain — you are in Croatia,
your data stays in the EU, and it is better for GDPR posture.

Verification usually takes minutes. Wait for **Verified** before continuing.

## 3. Create an API key — **YOU**

Resend → **API Keys** → **Create API Key** → permission **Sending access**.

Copy it once. It looks like `re_...`. Do not paste it into any chat.

## 4. Point Supabase at Resend — **YOU**

<https://supabase.com/dashboard/project/mpyxxqcwmrrrwsvjcsvx/auth/smtp>

Enable **Custom SMTP** and enter:

```
Host:         smtp.resend.com
Port:         587
Username:     resend
Password:     <your re_... API key>
Sender email: noreply@send.triangle-services.com
Sender name:  Triangle Services
```

Username is the literal word `resend` — not your email address. The API key
goes in the password field.

Save.

## 5. Fix the redirect allowlist while you are here — **YOU**

<https://supabase.com/dashboard/project/mpyxxqcwmrrrwsvjcsvx/auth/url-configuration>

**Site URL:**
```
https://triangle-services-os.vercel.app
```

**Redirect URLs** — both, with the `/**` wildcard:
```
https://triangle-services-os.vercel.app/**
http://localhost:3000/**
```

Without the wildcard, Supabase silently strips `/auth/callback` — the one page
that creates a session — and every magic link fails with no error. This is a
separate bug from the rate limit, and it will break Ralph's invite even after
SMTP works.

## 6. Test

1. Sign out of Triangle.
2. **Send magic link** on the login page.
3. The email should arrive in seconds, from `noreply@send.triangle-services.com`.
4. Clicking it should land you signed in — not back at the login page.

If it lands you back at login, step 5 was not saved.

## 7. Then invite Ralph

Supabase → **Authentication → Users → Add user → Send invitation**, using his
address. Then add him to `organization_members` with role `partner`:

```sql
insert into public.organization_members (organization_id, user_id, role, status)
select '00000000-0000-0000-0000-000000000001', id, 'partner', 'active'
from auth.users where email = 'RALPH_EMAIL_HERE'
on conflict do nothing;
```

He then sets his own password at Settings → Your account.

---

## Cost

Free tier: 3,000/month, 100/day. Triangle's actual usage is a few logins and
invites per week. If it ever grows past that, Resend is $20/month for 50,000 —
but that is not a realistic horizon for this use.

## If email still does not arrive

- Resend → **Logs** shows every send attempt and why it failed. Check there
  first; it is far more informative than Supabase's side.
- Domain must show **Verified** in Resend.
- Check spam once, then mark as not-spam — a brand-new sending domain has no
  reputation for the first few messages.
