-- Per-user ownership + Row Level Security for the `ideas` table.
-- Each idea belongs to the auth user who created it; users may only read/write their own.
-- The service-role client (used by the /api/ideas routes for external access) bypasses RLS.

-- 1. Ownership column — defaults to the current user so inserts are tagged automatically.
alter table public.ideas
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

alter table public.ideas
  alter column user_id set default auth.uid();

-- 2. Backfill existing rows.
-- This app has been single-user, so assign any orphaned ideas to the earliest/sole user.
-- For a true multi-user backfill, replace this with the correct per-row mapping first.
update public.ideas
set user_id = (select id from auth.users order by created_at asc limit 1)
where user_id is null;

-- Enforce ownership on every row now that existing data is backfilled.
alter table public.ideas
  alter column user_id set not null;

-- 3. Enable RLS and scope every operation to the owner.
alter table public.ideas enable row level security;

drop policy if exists "Users can view their own ideas" on public.ideas;
create policy "Users can view their own ideas"
  on public.ideas for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own ideas" on public.ideas;
create policy "Users can insert their own ideas"
  on public.ideas for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own ideas" on public.ideas;
create policy "Users can update their own ideas"
  on public.ideas for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own ideas" on public.ideas;
create policy "Users can delete their own ideas"
  on public.ideas for delete
  using (auth.uid() = user_id);
