# Triangle Services Business Development OS

Private internal app for Nikola and Ralph to build the 300-company lead database, manage sales pipeline, store company/project/worker documents, create AI-assisted outreach drafts, and later connect approved import agents.

This is not a public marketing website. It is an invite-only internal CRM/agency operating system for Triangle Services.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase Postgres, Auth and Storage
- Supabase Row Level Security
- OpenAI API through server-side route handlers
- Vercel deployment

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

If Supabase env vars are empty, the app runs in local demo mode with seeded in-code data so you can review the UI immediately. Production should use Supabase Auth and RLS.

## Supabase Setup

1. Create a Supabase project.
2. Copy project URL and anon key into `.env.local`.
3. Copy the service role key into `.env.local` as `SUPABASE_SERVICE_ROLE_KEY`.
4. Run `supabase/migrations/001_initial_schema.sql` in the Supabase SQL editor or through the Supabase CLI.
5. Run `supabase/seed.sql`.
6. Confirm the private `documents` storage bucket exists.
7. In Supabase Auth, configure redirect URLs:
   - `http://localhost:3000/**`
   - your Vercel deployment URL

## First Admin User

1. Create Nikola's user in Supabase Auth.
2. Insert or update a profile row with that user id.
3. Insert an active `organization_members` row for organization `00000000-0000-0000-0000-000000000001` with role `admin`.
4. Invite Ralph by creating an Auth user or invitation and an `organization_members` row with role `partner`.

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
IMPORT_API_SECRET=
DEFAULT_ORGANIZATION_ID=00000000-0000-0000-0000-000000000001
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

`SUPABASE_SERVICE_ROLE_KEY` is used only in server route handlers. Never expose it in client-side code.

## MVP Features Included

- Private app shell with login page, sidebar and top search
- Dashboard with 300-company progress, pipeline summary, tasks and activity
- Companies workspace with filtering, add form, CSV import/export and local scoring
- Contacts list and detail pages
- Opportunities list and detail pages
- Drag-and-drop Kanban pipeline
- Tasks page
- Document center with private signed URL endpoint
- Vendor document checklist page
- Document template generator page
- Worker/freelancer database
- AI Assistant UI
- `POST /api/ai/generate`
- `POST /api/import/csv`
- `POST /api/import/external-leads`
- `GET /api/documents/[id]/signed-url`
- `POST /api/documents/upload-metadata`
- `PATCH /api/opportunities/[id]/stage`
- `POST /api/activities`
- Supabase migration and seed SQL

## CSV Import

Company CSV columns supported by the UI and API:

```text
name,legal_name,company_type,country,city,website,linkedin_url,source_url,sectors,target_countries,notes,priority,owner
```

Contact import is prepared in the API shape. Recommended contact columns:

```text
full_name,first_name,last_name,job_title,role_category,company_name,email,phone,linkedin_url,language,source_url,notes
```

## External Import Endpoint

Future scraper/research agents can push reviewed leads to:

```http
POST /api/import/external-leads
x-import-api-secret: <IMPORT_API_SECRET>
```

This endpoint stores import batches and raw rows. It does not scrape, send emails, or automate outreach.

## Scripts

```bash
npm run dev
npm run build
npm run lint
```

## Vercel Deployment

1. Push the repo to GitHub.
2. Import the project into Vercel.
3. Set all environment variables in Vercel.
4. Add the Vercel URL to Supabase Auth redirect URLs.
5. Deploy.

## Security Notes

- No public signup flow is implemented.
- App routes are protected by Supabase middleware when Supabase env vars are configured.
- Business data is protected by organization membership through RLS.
- Sensitive documents are restricted by role and sensitivity.
- Supabase Storage `documents` bucket is private.
- Downloads use signed URLs.
- AI calls run server-side only.
- No automated mass email.
- No web scraping in MVP.
