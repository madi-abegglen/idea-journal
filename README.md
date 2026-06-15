# Idea Journal

A full-stack idea capture app built to preserve not just the idea, but the *feeling* behind it. Built with Next.js 15, Supabase, and the Anthropic API.

**Live:** [idea-journal-rho.vercel.app/journal/login](https://idea-journal-rho.vercel.app/login)

---

## What it does

Most note-taking tools capture *what* you thought, not *why it felt exciting*. Idea Journal walks you through a structured capture flow:

1. **Dump** — get the raw idea out, messy is fine
2. **Deepen** — 4 guided follow-up questions (what sparked it, what problem it solves, the exciting angle, the feeling)
3. **Essence** — an AI-generated 2-3 sentence summary that re-captures the energy of the idea, not just the content

Ideas are stored persistently in Postgres and accessible from any device.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Database | Supabase (Postgres) |
| Auth | Supabase Auth (email/password) |
| AI | Anthropic API (claude-sonnet-4-6) |
| Deployment | Vercel |

---

## Architecture

```
Browser (authenticated session)
    ↓
Next.js App Router
    ├── /login          → public, Supabase Auth sign-in
    └── /journal        → protected by middleware.ts
            ↓
    /api/summary        → server-side Anthropic API call (key never touches client)
            ↓
    Supabase Postgres   → RLS enabled, authenticated users only
```

**Key patterns:**
- Separate Supabase clients for admin (`service_role`), server (SSR), and browser (anon + session)
- Route protection via Next.js middleware — unauthenticated requests redirect to `/login` before the page renders
- AI summary generation runs server-side to keep the Anthropic API key off the client
- Row Level Security (RLS) on the `ideas` table — no public access, authenticated users only

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── ideas/
│   │   │   ├── route.ts          # GET (all ideas), POST (new idea)
│   │   │   └── [id]/
│   │   │       └── route.ts      # PATCH, DELETE by id
│   │   └── summary/
│   │       └── route.ts          # AI summary generation
│   ├── journal/
│   │   └── page.tsx              # Main journal UI (protected)
│   └── login/
│       └── page.tsx              # Login page
├── lib/
│   └── supabase/
│       ├── admin.ts              # Service role client (server only)
│       ├── server.ts             # SSR client (server components + middleware)
│       └── client.ts             # Browser client (client components)
└── middleware.ts                 # Auth protection for /journal routes
```

---

## Local Setup

### Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) project
- An [Anthropic](https://console.anthropic.com) API key

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
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Anthropic
ANTHROPIC_API_KEY=your_anthropic_api_key

# API security
API_SECRET=your_generated_secret
```

### 3. Set up the database

In your Supabase SQL editor, run:

```sql
-- Create ideas table
create table ideas (
  id uuid default gen_random_uuid() primary key,
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

-- Allow authenticated users full access
create policy "Authenticated users can read ideas" on ideas for select to authenticated using (true);
create policy "Authenticated users can insert ideas" on ideas for insert to authenticated with check (true);
create policy "Authenticated users can update ideas" on ideas for update to authenticated using (true);
create policy "Authenticated users can delete ideas" on ideas for delete to authenticated using (true);
```

### 4. Create a user

In Supabase dashboard → Authentication → Users → Add user → Create new user.

### 5. Run locally

```bash
npm run dev
```

Navigate to `http://localhost:3000/journal` — you'll be redirected to login.

---

## Deployment

Deployed on Vercel. Add all environment variables from `.env.local` to your Vercel project settings before deploying.

```bash
git push  # Vercel auto-deploys on push to main
```

---

## License

MIT
