-- Self-service account deletion.
-- Lets an authenticated user delete their own auth record without exposing the
-- service-role key. Their ideas are removed automatically via the
-- ideas.user_id ON DELETE CASCADE constraint. Runs as definer so it can touch auth.users.

create or replace function public.delete_user_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Always scoped to the caller — they can only ever delete themselves
  delete from auth.users where id = auth.uid();
end;
$$;

-- Only logged-in users may call it
revoke all on function public.delete_user_account() from public, anon;
grant execute on function public.delete_user_account() to authenticated;
