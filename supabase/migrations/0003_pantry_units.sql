-- Phase 2 — Unit-aware pantry tracking
--
-- The app is not yet live, so existing pantry rows are wiped. Going forward
-- every pantry item carries a `unit` from a fixed allowlist plus a
-- `normalized_name` (lowercase trimmed) used for autocomplete + dedupe.
--
-- Decision: no column-level default on `unit`. Every INSERT must pass a unit
-- explicitly. A future bug that forgets to send one fails loudly at the DB
-- layer rather than silently writing a wrong default.

-- 1. Wipe existing rows. Clean slate.
truncate table public.pantry_items;

-- 2. Add the unit column with a CHECK constraint and NO default.
alter table public.pantry_items
  add column unit text not null
  check (unit in (
    'count',
    'oz',
    'lb',
    'g',
    'kg',
    'fl_oz',
    'cup',
    'tbsp',
    'tsp',
    'ml',
    'L'
  ));

-- 3. Add normalized_name (lowercase trimmed name, used by autocomplete & dedupe).
alter table public.pantry_items
  add column normalized_name text not null;

-- 4. One row per (user, normalized_name). Prevents accidental dupes like
--    "Onions" and "onions" coexisting in the same pantry.
create unique index if not exists pantry_items_user_id_normalized_name_idx
  on public.pantry_items (user_id, normalized_name);
