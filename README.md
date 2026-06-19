# Idea Journal

A full-stack idea capture app built to preserve not just the idea, but the *feeling* behind it. Built with Next.js 15, Supabase, and the Anthropic API.

**Live:** [idea-journal-rho.vercel.app/journal](https://idea-journal-rho.vercel.app/journal)

---

## What it does

Most note-taking tools capture *what* you thought, not *why it felt exciting*. Idea Journal walks you through a structured capture flow:

1. **Dump** — get the raw idea out, messy is fine
2. **Deepen** — 4 guided follow-up questions (what sparked it, what problem it solves, the exciting angle, how it feels) with back/skip navigation so you can revise earlier answers
3. **Essence** — an AI-generated 2-3 sentence summary that re-captures the energy of the idea, not just the content — regenerate it any time if it misses the mark

Ideas are stored persistently in Postgres, scoped per user, and accessible from any device.

---

## Features

- **Multi-user auth** — registration with email confirmation and a "What name do you go by?" prompt, login, and session management via Supabase Auth; the chosen name personalizes the journal greeting
- **Guided capture flow** — dump → 4 deepening questions with back/skip navigation → AI-generated essence summary
- **Regenerate summary** — a quiet "regenerate summary?" affordance on both the done screen and the idea detail view re-runs the AI summary from the saved fields and updates it in place
- **Ideas list** — browse all captured ideas with an expandable detail view
- **Edit & delete** — inline editing of all fields, delete with confirmation
- **Profile menu** — update name, email (with confirmation link), or password; sign out; or delete the account and all its ideas (via a secure Postgres RPC)
- **Per-user data isolation** — Row Level Security ensures users only ever see their own ideas (`auth.uid() = user_id`)

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Database | Supabase (Postgres) |
| Auth | Supabase Auth (email/password + email confirmation) |
| AI | Anthropic API (claude-sonnet-4-6) |
| Deployment | Vercel |

---

## Architecture

```
Browser (authenticated session)
    ↓
Next.js App Router
    ├── /login          → public — sign in + registration with email confirmation
    └── /journal        → protected by middleware.ts
            ↓
    /api/ideas/[id]     → PATCH, DELETE — authenticated via Supabase session cookies
                          (PATCH also persists regenerated summaries)
    /api/summary        → POST — server-side Anthropic API call (key never touches client)
                          used for both initial capture and "regenerate summary?"
            ↓
    Supabase Postgres   → RLS enabled, all reads/writes scoped to auth.uid()
```

**Key patterns:**
- Separate Supabase clients for server (SSR) and browser (anon + session)
- Route protection via Next.js middleware — unauthenticated requests redirect to `/login` before the page renders
- AI summary generation runs server-side to keep the Anthropic API key off the client
- Row Level Security (RLS) scopes all DB operations to the authenticated user's own data
- User metadata (`first_name`) stored on the Supabase Auth user object — no extra table needed
- Account deletion via `SECURITY DEFINER` Postgres function — self-service without exposing a service role key

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── ideas/
│   │   │   └── [id]/
│   │   │       └── route.ts      # PATCH, DELETE by id (session auth)
│   │   └── summary/
│   │       └── route.ts          # Server-side AI summary generation
│   ├── journal/
│   │   └── page.tsx              # Main journal UI — capture flow, regenerate, ideas list, profile menu
│   ├── login/
│   │   └── page.tsx              # Sign in + registration with name prompt (toggleable)
│   ├── layout.tsx               # Root layout
│   ├── globals.css              # Global styles (incl. spin keyframe for regenerate affordance)
│   └── page.tsx                 # Landing — redirects into the journal
├── lib/
│   └── supabase/
│       ├── server.ts             # SSR client (middleware + server components)
│       └── client.ts             # Browser client (client components)
└── middleware.ts                 # Auth protection — redirects unauthenticated users to /login
```

---

## Local Setup

### Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) project
- An [Anthropic](https://console.anthropic.com) API key with credits

### 1. Clone and install

```bash
git clone https://github.com/madi-abegglen/idea-journal.git
cd idea-journal
npm install
```

### 2. Set up environment variables

Create a `.env.local` file in the project root:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Anthropic
ANTHROPIC_API_KEY=your_anthropic_api_key
```

### 3. Set up the database

In your Supabase SQL Editor, run:

```sql
-- Create ideas table with per-user ownership
create table ideas (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  dump text not null,
  trigger text,
  problem text,
  magic text,
  energy text,
  summary text,
  timestamp bigint not null,
  created_at timestamptz default now()
);

-- Enable RLS
alter table ideas enable row level security;

-- Per-user access policies
create policy "Users can read own ideas"   on ideas for select    to authenticated using (auth.uid() = user_id);
create policy "Users can insert own ideas" on ideas for insert    to authenticated with check (auth.uid() = user_id);
create policy "Users can update own ideas" on ideas for update    to authenticated using (auth.uid() = user_id);
create policy "Users can delete own ideas" on ideas for delete    to authenticated using (auth.uid() = user_id);

-- Self-service account deletion (SECURITY DEFINER runs with elevated privileges server-side)
create or replace function delete_user_account()
returns void
language sql
security definer
as $$
  delete from auth.users where id = auth.uid();
$$;
```

### 4. Configure Supabase Auth

In Supabase dashboard → **Authentication** → **URL Configuration**:
- **Site URL:** `https://your-vercel-url.vercel.app`
- **Redirect URLs:** `https://your-vercel-url.vercel.app/**`

In **Authentication** → **Email**:
- Enable **Confirm email** for production

### 5. Run locally

```bash
npm run dev
```

Navigate to `http://localhost:3000/journal` — you'll be redirected to `/login`. Register a new account to get started.

---

## Deployment

Deployed on Vercel. Add all `.env.local` variables to your Vercel project environment variables before deploying.

```bash
git push  # Vercel auto-deploys on push to main
```

---

## License

MIT
