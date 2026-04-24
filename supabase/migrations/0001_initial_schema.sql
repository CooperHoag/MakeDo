-- MakeDo Phase 1 initial schema
-- Run this in the Supabase SQL editor.
--
-- Tables:
--   profiles        — 1:1 with auth.users
--   pantry_items    — user pantry inventory (name + quantity only)
--   ai_generations  — log of AI calls for per-user daily rate limiting
--
-- RLS is enabled on all tables and locked to auth.uid() ownership.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  onboarding_complete boolean not null default false
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (id = auth.uid());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
  on public.profiles for delete
  using (id = auth.uid());

-- ---------------------------------------------------------------------------
-- pantry_items
-- ---------------------------------------------------------------------------
create table if not exists public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  quantity integer not null default 1 check (quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pantry_items enable row level security;

drop policy if exists "pantry_items_select_own" on public.pantry_items;
create policy "pantry_items_select_own"
  on public.pantry_items for select
  using (user_id = auth.uid());

drop policy if exists "pantry_items_insert_own" on public.pantry_items;
create policy "pantry_items_insert_own"
  on public.pantry_items for insert
  with check (user_id = auth.uid());

drop policy if exists "pantry_items_update_own" on public.pantry_items;
create policy "pantry_items_update_own"
  on public.pantry_items for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "pantry_items_delete_own" on public.pantry_items;
create policy "pantry_items_delete_own"
  on public.pantry_items for delete
  using (user_id = auth.uid());

-- Auto-update updated_at on row update
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pantry_items_set_updated_at on public.pantry_items;
create trigger pantry_items_set_updated_at
  before update on public.pantry_items
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- ai_generations
-- ---------------------------------------------------------------------------
create table if not exists public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null,
  created_at timestamptz not null default now()
);

alter table public.ai_generations enable row level security;

drop policy if exists "ai_generations_select_own" on public.ai_generations;
create policy "ai_generations_select_own"
  on public.ai_generations for select
  using (user_id = auth.uid());

drop policy if exists "ai_generations_insert_own" on public.ai_generations;
create policy "ai_generations_insert_own"
  on public.ai_generations for insert
  with check (user_id = auth.uid());

drop policy if exists "ai_generations_update_own" on public.ai_generations;
create policy "ai_generations_update_own"
  on public.ai_generations for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "ai_generations_delete_own" on public.ai_generations;
create policy "ai_generations_delete_own"
  on public.ai_generations for delete
  using (user_id = auth.uid());

create index if not exists ai_generations_user_id_created_at_idx
  on public.ai_generations (user_id, created_at);

-- ---------------------------------------------------------------------------
-- Auto-create profiles row for every new auth user
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
