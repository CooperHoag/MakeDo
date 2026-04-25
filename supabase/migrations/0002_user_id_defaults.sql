-- Default user_id to auth.uid() on user-owned tables so inserts from the
-- authenticated client don't have to repeat the value (and don't fail RLS
-- when the column is omitted). Profiles is keyed by `id`, not user_id, and
-- is created via the handle_new_user trigger on auth.users — leave it alone.

alter table public.pantry_items
  alter column user_id set default auth.uid();

alter table public.ai_generations
  alter column user_id set default auth.uid();
