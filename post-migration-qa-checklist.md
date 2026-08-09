# MakeDo — Post-Migration Manual QA Checklist

Run this every time after applying a new SQL migration to Supabase. Each section is a copy-paste SQL query plus what to look for in the result. Adapt the table/column names per migration.

---

## How to use

1. Open Supabase dashboard → your MakeDo project → left sidebar **SQL Editor** → **New query**.
2. Copy a query below, paste, click **Run**.
3. Compare the result against the "Expected" line.
4. If a query fails or returns unexpected results, stop and diagnose before continuing.

Apply migrations one at a time in order. Don't paste multiple migrations into a single query — run each separately so you can isolate failures.

---

## 1. Confirm a table is empty (after a TRUNCATE migration)

```sql
SELECT count(*) FROM public.<TABLE_NAME>;
```

**Expected:** single row, `count = 0`.

---

## 2. Inspect a table's columns, types, defaults, and nullability

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = '<TABLE_NAME>'
ORDER BY ordinal_position;
```

**Expected:** one row per column. Verify types, NOT NULL constraints, and default values match the migration.

---

## 3. List all indexes on a table

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = '<TABLE_NAME>';
```

**Expected:** one row per index. Verify expected indexes exist and any unique/partial flags are correct in the `indexdef` text.

---

## 4. List all RLS policies on a table

```sql
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = '<TABLE_NAME>'
ORDER BY cmd;
```

**Expected for any user-owned table:** four rows — one each for `SELECT`, `INSERT`, `UPDATE`, `DELETE`.

- `SELECT` / `UPDATE` / `DELETE` rows: `qual = (user_id = auth.uid())`, `with_check = NULL`
- `INSERT` row: `qual = NULL`, `with_check = (user_id = auth.uid())`

The NULLs on the INSERT row are correct — `qual` gates existing rows, `with_check` gates new ones.

---

## 5. Verify RLS is actually enabled on a table

```sql
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = '<TABLE_NAME>';
```

**Expected:** `relrowsecurity = true`.

If `false`, the migration forgot to run `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`.

---

## 6. Verify a `pg_cron` scheduled job is registered

```sql
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname = '<JOB_NAME>';
```

**Expected:** one row, `active = true`, `schedule` matches the cron expression in the migration.

If you get an error about `cron.job` not existing, the `pg_cron` extension isn't enabled on the project.

---

## 7. Manually trigger a `pg_cron` job (without waiting for the schedule)

```sql
-- Find the job
SELECT jobid FROM cron.job WHERE jobname = '<JOB_NAME>';

-- Then run the job's command directly (paste the body from the migration's cron.schedule call)
-- Example for delete_expired_recipes:
DELETE FROM recipes WHERE is_favorite = false AND expires_at < now();
```

**Expected:** the DELETE runs without error. Check row counts before and after to confirm.

---

## 8. Insert a test row as a real user (when SQL Editor's `auth.uid()` returns NULL)

The Supabase SQL Editor runs as the `postgres` admin role, so `auth.uid()` returns NULL there. To test inserts that depend on `auth.uid()`, pass an explicit user_id:

```sql
INSERT INTO public.<TABLE_NAME> (user_id, <other_columns>)
VALUES (
  (SELECT id FROM auth.users LIMIT 1),
  <other_values>
)
RETURNING *;
```

**Expected:** one row returned. Verify any defaulted columns (`created_at`, `expires_at`, `is_favorite`, etc.) populated correctly.

---

## 9. Clean up test rows

```sql
DELETE FROM public.<TABLE_NAME> WHERE <unique_marker_column> = '<test_value>';
```

**Expected:** success. Run a `SELECT count(*)` after to confirm cleanup.

---

## 10. Sanity check the app still launches

In the VS Code terminal at the project root:

```
npx expo start -c
```

Press `i` for iOS simulator (or scan the QR with Expo Go). Sign in. Smoke test the screens that touch the changed tables. Check both:

- No red error banners when the screen loads.
- No silent failures (e.g., a list that should populate but doesn't).

If something breaks, check the Metro log in your terminal for the actual error.

---

## 11. Verify a row inserted from the app has correct defaults

After adding an item via the app UI, jump back to Supabase → Table Editor → click the table → find the new row. Confirm any defaulted columns landed correctly (e.g., `unit = 'count'` for the Phase 2 placeholder, `user_id` matches your auth user's UUID).

---

## When something fails

- **"extension does not exist"** → the migration depends on a Postgres extension (e.g., `pg_cron`) that isn't enabled. Enable it via `CREATE EXTENSION IF NOT EXISTS <name>;` or through the Supabase dashboard's Database → Extensions panel.
- **"violates not-null constraint"** → the migration created a NOT NULL column without a default and the insert didn't pass a value. Either fix the migration to add a default or always pass the column explicitly.
- **"permission denied"** → almost always means RLS is blocking. Either run the query as the right role or fix the policy.
- **Less than the expected number of RLS policies** → the migration only created some of them. Re-read the migration and verify each `CREATE POLICY` statement.
- **Cron job missing from `cron.job`** → the `cron.schedule()` call inside the migration silently failed. Check whether `pg_cron` is enabled and whether the migration ran without errors.

---

## Reference: standard convention for new user-owned tables

Every new user-owned table in MakeDo should have:

- `user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE`
- RLS enabled
- Four policies (SELECT/INSERT/UPDATE/DELETE) gated to `user_id = auth.uid()`
- An index on `(user_id, ...)` matching the most common query pattern

This is documented in `CLAUDE.md` under "Convention for any new user-owned table."
