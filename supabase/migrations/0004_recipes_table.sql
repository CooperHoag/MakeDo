-- Phase 2 — Persisted recipes
--
-- Recipes were in-memory only in Phase 1. Phase 2 makes Supabase the source of
-- truth. Non-favorited rows hard-delete after 14 days via the pg_cron job
-- registered in 0005_recipes_cleanup_cron.sql.
--
-- Decision: `expires_at` uses a column-level default of `now() + interval
-- '14 days'`. Simpler than a BEFORE INSERT trigger and equivalent in behavior
-- since `created_at` defaults to `now()` on the same row. If we ever need a
-- non-default backfill window we can move this into a trigger.

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  name text not null,
  description text,
  category text not null
    check (category in ('breakfast', 'lunch', 'dinner', 'dessert', 'snack')),
  ingredients jsonb not null,
  steps jsonb not null,
  estimated_minutes integer,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days')
);

alter table public.recipes enable row level security;

drop policy if exists "recipes_select_own" on public.recipes;
create policy "recipes_select_own"
  on public.recipes for select
  using (user_id = auth.uid());

drop policy if exists "recipes_insert_own" on public.recipes;
create policy "recipes_insert_own"
  on public.recipes for insert
  with check (user_id = auth.uid());

drop policy if exists "recipes_update_own" on public.recipes;
create policy "recipes_update_own"
  on public.recipes for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "recipes_delete_own" on public.recipes;
create policy "recipes_delete_own"
  on public.recipes for delete
  using (user_id = auth.uid());

-- Default listing: newest-first per user.
create index if not exists recipes_user_id_created_at_idx
  on public.recipes (user_id, created_at desc);

-- Favorites filter — partial index keeps it small.
create index if not exists recipes_user_id_is_favorite_idx
  on public.recipes (user_id, is_favorite)
  where is_favorite = true;

-- Cleanup job lookup — partial index over rows the cron actually scans.
create index if not exists recipes_expires_at_not_favorite_idx
  on public.recipes (expires_at)
  where is_favorite = false;
