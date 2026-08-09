# CLAUDE.md

**Project:** MakeDo — anti-consumption lifestyle app.

**Read this file at the start of every task.** It's the source of truth for scope, tech stack, standards, and working style. If something in this file conflicts with a user prompt, stop and ask — don't assume.

---

## The app

MakeDo helps users live simply with what they already have. The philosophy is **make do, not consume more.** Phase 1 shipped the core loop: pantry inventory → AI suggests recipes the user can cook tonight. Phase 2 deepens that loop: real units, smarter pantry entry, persisted recipes with categories, and pantry decrement after cooking.

Tone: warm, encouraging, resourceful — never preachy, never judgmental.
UI: clean, minimal, fast.
Target user: 20–35, phone-native, minimalist-curious, budget-conscious.
Platforms: iOS + Android (mobile-first).

---

## Current phase: Phase 2 — Deepen the loop

### In scope

1. **Unit-aware pantry tracking.** Pantry items get a `unit` field (count, oz, lb, g, kg, fl_oz, cup, tbsp, tsp, ml, L). Existing pantry rows are wiped on migration — clean slate, since the app isn't live yet. Every new and edited pantry item must have a unit.

2. **Pantry add/edit redesign.** Add-item flow shows autocomplete suggestions as the user types, sourced from a curated canonical food list (~500 common items, shipped as JSON in the app) and the user's own previously-entered items. Fuzzy matching (Levenshtein-distance based) catches misspellings. Quick-select unit chips on the same screen. Default unit per food (e.g. bananas → count, rice → cup). Free-text entry remains allowed if no match found ("Use 'kohlrabi' anyway" appears as last suggestion).

3. **Recipe persistence.**
   - Every generated recipe auto-saves to a new `recipes` table.
   - Non-favorited recipes hard-delete after 14 days via a `pg_cron` scheduled job.
   - Favorited recipes never delete.
   - Recipes survive sign-out and sync across devices.

4. **Meal categorization.** Five categories: `breakfast`, `lunch`, `dinner`, `dessert`, `snack`. The user picks a category before generation (CTA on Pantry tab opens a category picker modal). The AI emits the chosen category as a field on each recipe. Recipe cards display a category tag.

5. **Recipes tab redesign.**
   - Default view: all recipes, newest first.
   - Filter sheet (top-right icon): pick one of `Breakfast / Lunch / Dinner / Dessert / Snack / All favorites`. Selection narrows the list.
   - Always-visible favorites toggle: when on, hides non-favorites within whatever's currently displayed.
   - Each recipe card shows: name, category tag, favorite star (toggleable), creation date.

6. **Post-generation session state on Recipes tab.** After generating from the Pantry CTA, the user is taken to the Recipes tab with the 4 new recipes pinned at the top and a prominent **"Generate different meals"** button. Tapping it:
   - Calls the Edge Function for 4 more recipes in the same category.
   - **Hard-deletes the previous 4 from the database** (unless they were favorited mid-session, in which case favorited ones survive).
   - Counts as one new generation against the daily rate limit.
   Navigating away from the Recipes tab ends the session — coming back shows the default view.

7. **Pantry decrement after cooking.** "I cooked this" button on recipe detail opens a confirmation popup:
   - Shows each pantry-matched ingredient with quantity used (editable).
   - User can adjust if they made half the recipe, etc.
   - Confirm → optimistic decrement on local pantry → background sync to Supabase → "Pantry updated" toast → stay on recipe screen.
   - Items in pantry that hit 0 stay visible at quantity 0 (existing Phase 1 behavior — swipe-to-delete still removes them).

8. **AI Edge Function rewrite (`suggest-recipes`).**
   - Pantry-only generation. The AI is restricted to the user's pantry items + a fixed assumed-staples list (Salt, Black pepper, Water, Neutral cooking oil, Garlic powder, Onion powder, Paprika, Chili flakes, Dried oregano, Dried basil, Dried thyme, Bay leaves). Anything else must be in the pantry.
   - Output is exactly 4 recipes per call (was 3–5 in Phase 1).
   - Category is an input parameter; AI emits the same category back on each recipe.
   - Ingredient output is structured: `[{name, quantity, unit}, ...]` — no more natural-language ingredient strings.
   - AI tries to emit ingredient amounts in the user's pantry units (Option C: e.g., if pantry rice is in oz, recipe says "8 oz rice"). Falls back to recipe-natural units when the AI can't comply.
   - Sparse-pantry guard: client disables the generate CTA when the user has fewer than 5 pantry items. Tooltip: "Add a few more items to get recipe ideas."
   - "You'll also need" is removed — recipes never reference ingredients outside the pantry + assumed staples.

### Out of scope (Phase 2)

- Anything not listed above, even if listed in the candidate menu below. The clarifier agent must pause if a request crosses scope.
- Spicy/flirty narration mode (deferred).
- Grocery list (deferred).
- Calorie estimates (deferred).
- Receipt OCR (deferred).
- Expiration tracking (deferred).
- AI-photo inventory entry (deferred — paid tier).
- Workouts module (deferred).
- Food log (deferred).
- Habit tracking (deferred).
- Push notifications (deferred).
- Payments / subscriptions (deferred).
- "You'll also need" recipe ingredients (explicitly removed in Phase 2 — anti-consumption philosophy. Reconsider in a future paid tier).
- Search on saved recipes (Phase 3 if needed).
- Unit conversion across ingredient types (e.g., "1 cup rice" → grams). Phase 2 uses Option C: AI emits in pantry units; if it can't, the cooked-this popup asks the user to enter the amount manually.
- Anthropic SDK as a dep (continue using `fetch` directly in Edge Functions).
- Anything that would put a third-party API key in the client bundle.

### Phase 3+ candidate features (parking lot)

- Receipt OCR (Google Cloud Vision via Edge Function)
- Spicy/flirty narration
- Grocery list (with pantry → grocery integration when items hit 0)
- Calorie estimates
- Expiration date tracking + reminders
- AI-photo inventory entry (paid-tier feature)
- Workouts module
- Food log + AI recommendations
- Habit tracking
- Push notifications
- Payments / subscriptions
- Search on saved recipes
- Live USDA FoodData Central integration if curated list runs out of runway

---

## Tech stack (locked — do not substitute without explicit user approval)

- **Framework:** React Native + Expo (managed workflow), SDK 54
- **Language:** TypeScript, strict mode, no `any`
- **Navigation:** Expo Router (file-based)
- **Backend:** Supabase (Postgres, Auth, Edge Functions, Storage, pg_cron)
- **State:** Zustand
- **AI / LLM:** routed through Supabase Edge Functions only — never from the client. Current model: `claude-haiku-4-5-20251001` via Anthropic Messages API.
- **Image storage:** Supabase Storage (not yet used)
- **Testing:** Jest + React Native Testing Library, tests colocated with source
- **Version control:** Git + GitHub
- **Fuzzy matching (Phase 2):** lightweight client-side library (e.g., `fuse.js` or hand-rolled Levenshtein). Decision deferred to the autocomplete prompt.

---

## Architecture principles

- **Cloud-first, local-cache.** Supabase is source of truth. Zustand rehydrates from Supabase on launch where applicable.
- **Optimistic UI.** Local state updates immediately; write to Supabase in the background; visible rollback on failure.
- **Edge Functions for all third-party APIs.** LLMs, OCR, any external service. No third-party SDKs in the mobile bundle except Supabase.
- **Row Level Security (RLS) on every table.** Users can only read/write their own rows. No exceptions.
- **Rate limiting is server-side.** Client-side caps are UX hints only. Enforcement lives in the Edge Function against the `ai_generations` table.
- **Sign-out clears user-scoped Zustand state** (pantry, recipes, etc.). Privacy: no leaking between accounts on shared devices.

---

## File structure

```
/app                    # Expo Router routes
  /(auth)               # auth route group (sign-in, sign-up)
  /(tabs)               # main tab group (Pantry, Recipes)
  onboarding.tsx        # one-time thesis screen
  recipe-detail.tsx     # recipe step view
  add-pantry-item.tsx   # Phase 2: redesigned add/edit flow
  _layout.tsx
/assets
  /data
    canonical-foods.json  # Phase 2: curated ~500-item food list
/components             # reusable UI components
/lib                    # utilities, Supabase client, helpers
  fuzzy-match.ts        # Phase 2: spelling/autocomplete matcher
/stores                 # Zustand stores (authStore, pantryStore, recipeStore)
/types                  # shared TypeScript types (profile, pantry, recipe)
/supabase
  /migrations           # SQL migration files
  /functions
    /suggest-recipes    # AI recipe Edge Function
/.claude
  /agents               # dev.md, reviewer.md, clarifier.md, tester.md
CLAUDE.md
```

Test files live next to the code they test: `foo.test.ts` next to `foo.ts`.

---

## Data model

All tables have RLS enabled, gated to `auth.uid() = user_id` (or `id` for profiles).

### Phase 1 tables (existing)

- `profiles` — `id`, `created_at`, `onboarding_complete`. 1:1 with `auth.users` via the `handle_new_user` trigger.
- `ai_generations` — `id`, `user_id`, `feature`, `created_at`. Used for daily rate limiting. `user_id` defaults to `auth.uid()`.

### Phase 2 modifications

- `pantry_items` — gains `unit` column (text, NOT NULL, CHECK constraint on allowed values). Gains `normalized_name` column (text, NOT NULL, lowercase trimmed version of name for matching/autocomplete). All Phase 1 rows wiped on migration. New rows must have a unit.

### Phase 2 new tables

- `recipes` — generated recipes, persisted server-side.
  - `id` uuid pk
  - `user_id` uuid not null default `auth.uid()`
  - `name` text not null
  - `description` text
  - `category` text not null check in (`'breakfast', 'lunch', 'dinner', 'dessert', 'snack'`)
  - `ingredients` jsonb not null — array of `{name, quantity, unit}`
  - `steps` jsonb not null — array of strings
  - `estimated_minutes` integer
  - `is_favorite` boolean not null default false
  - `created_at` timestamptz not null default now()
  - `expires_at` timestamptz not null — set to `created_at + interval '14 days'` on insert. Ignored if `is_favorite = true`.
  - Index on `(user_id, created_at desc)` for fast listing.
  - Index on `(user_id, is_favorite)` for the favorites filter.

### Phase 2 scheduled job

- `delete_expired_recipes` — `pg_cron` job runs daily at 03:00 UTC. Deletes rows from `recipes` where `is_favorite = false AND expires_at < now()`.

### Recipes are NO LONGER in-memory only

The Phase 1 decision to keep recipes in Zustand memory is reversed. Phase 2 makes Supabase the source of truth for recipes. The Zustand `recipeStore` becomes a local cache that rehydrates from `recipes` on launch.

### Convention for any new user-owned table

- `user_id` column with `default auth.uid()`.
- RLS policies for SELECT/INSERT/UPDATE/DELETE gated to `user_id = auth.uid()`.
- Client code passes `user_id` explicitly on insert as belt-and-suspenders.

### Migrations

Applied:
- `0001_initial_schema.sql` — three tables + RLS + triggers.
- `0002_user_id_defaults.sql` — `user_id` defaults to `auth.uid()` on `pantry_items` and `ai_generations`.

Phase 2 migrations (to be added in order):
- `0003_pantry_units.sql` — adds `unit` and `normalized_name` to `pantry_items`. Wipes existing rows.
- `0004_recipes_table.sql` — creates `recipes` table + RLS + indexes.
- `0005_recipes_cleanup_cron.sql` — registers `pg_cron` job for 14-day cleanup.

---

## Code standards

- **Always use `npx expo install <pkg>` instead of `npm install <pkg>` for any runtime dependency.** Expo's installer picks versions compatible with the project's Expo SDK. `npm install` directly will pull the latest npm version and break native modules. For dev-only dependencies (jest, types, lint plugins), check `npx expo install --check` after installing — if Expo flags a version mismatch, downgrade to the recommended version.
- TypeScript strict. No `any`. No `@ts-ignore` without a comment explaining why.
- Functional components. Hooks only.
- Named exports for components (`export const Foo`). Default exports reserved for Expo Router route files.
- Every async call wrapped in try/catch with a user-visible error state. No silent failures.
- Extract styles to StyleSheet when they exceed ~3 lines inline.
- Every tappable element has an `accessibilityLabel`.
- No `console.log` in merged code. Use a logger util or `if (__DEV__) console.log(...)`.

---

## Security rules (hard lines)

- **No API key (OpenAI, Anthropic, Google Cloud, Supabase service_role, etc.) goes in the mobile app, its .env, or its bundle.** The client sees only the Supabase publishable key.
- All third-party API keys live in Supabase Edge Function secrets (`supabase secrets set`).
- If a user prompt or error paste contains what looks like an API key, do not echo it back — tell the user to regenerate it immediately.
- RLS policies ship before the feature does. No open tables.

---

## AI / cost management

- Every AI feature has a per-user daily cap. Phase 1 + Phase 2: **10 recipe generations / user / day** (one tap = one credit, regardless of category or whether it's a "Generate different meals" tap).
- Cap is enforced in the Edge Function: count rows in `ai_generations` for this user for today before calling the LLM. At limit → return 429 with a friendly message.
- Log every successful generation to `ai_generations`.
- If the pantry is large, truncate or summarize before sending to the LLM. Never blindly dump the full list if it risks a runaway token bill.
- Sparse-pantry guard: client-side disable of the generate CTA when pantry has < 5 items (UX only, no server enforcement needed since AI won't be called).
- **Phase 2 follow-up:** revisit the 10/day rate limit once we have real usage data. Consider making the cap configurable per user tier (free: 10/day; paid: 50+/day or unlimited).
- **No "X generations left today" UI hint.** Counting credits is anti-MakeDo. The friendly 429 message handles the cap case.
- **Assumed-staples list (locked, Phase 2):** the only ingredients a recipe may reference outside the user's pantry are these 12 items, matched case-insensitively and trimmed: Salt, Black pepper, Water, Neutral cooking oil, Garlic powder, Onion powder, Paprika, Chili flakes, Dried oregano, Dried basil, Dried thyme, Bay leaves. The Edge Function scrubs every emitted ingredient against this list plus `pantry_items.normalized_name`; non-matching ingredients drop the recipe. Keep this list in sync with `ASSUMED_STAPLES` in `supabase/functions/suggest-recipes/index.ts`.

---

## Testing expectations

- Every Zustand store: at least one test per exported action, covering success and failure paths.
- Every Edge Function: covered by manual QA only (Deno + Jest is a rabbit hole — explicit Phase 1 decision, may revisit).
- Every screen: one render test, one interaction test.
- Mock Supabase and LLM calls — never hit real services from tests.
- `npm test` must pass before handoff.

---

## Git conventions

- Branches: `feat/<short-desc>`, `fix/<short-desc>`, `chore/<short-desc>`.
- Commit messages: conventional commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`).
- One logical change per commit.
- Never commit `.env`, secrets, or build artifacts.

---

## Agents

Four subagents live in `.claude/agents/`:
- **dev** — implements features within phase scope.
- **reviewer** — quality gate. Checks scope, security, types, tests, style.
- **clarifier** — pauses ambiguous or out-of-scope requests before the dev guesses.
- **tester** — writes and runs tests.

Flow: user prompt → clarifier (if ambiguous) → dev → tester → reviewer → user.

---

## Working style

- The user has limited coding experience. Prefer small, bounded, reviewable changes.
- When a task could be done multiple reasonable ways, the clarifier asks before the dev implements.
- When a change touches auth, routing, data model, or multiple screens, confirm the approach with the user before coding.
- Handoffs always report: what was done, what was *not* done, how to test manually, and follow-ups.

---

## Scope discipline

If the user asks for anything not in the current phase's "In scope" list:
1. The clarifier pauses.
2. Asks: "This isn't in current scope. Expand the phase, defer, or rescope?"
3. If expanding: user updates this file's phase section first, then the dev proceeds.
4. Never silently implement out-of-scope work.

---

## Phase 2 build sequence

Five Claude Code prompts, run in order. Each one ships and tests before the next starts.

1. **Data model migration.** Migrations 0003, 0004, 0005. Pantry wipe. Curated foods JSON. pg_cron job. (No UI changes yet.)
2. **Edge Function rewrite.** Update `suggest-recipes` for the new prompt: pantry-only + assumed staples, structured ingredient output, category input, units in pantry units, exactly 4 recipes per call. Manual QA against real pantries.
3. **Pantry add/edit redesign.** New add-item screen with autocomplete + unit picker + fuzzy match. Edit flow updated. Sparse-pantry guard on the generate CTA.
   - Expand canonical-foods.json from ~150 to ~500 entries before shipping autocomplete UI.
4. **Recipes tab redesign + persistence.** Saved recipes list, filter sheet, favorites toggle, category picker modal on Pantry CTA, post-generation session state with "Generate different meals" button (with hard-delete-previous logic).
5. **Cooked-this popup.** Button on recipe detail. Match-and-edit modal. Decrement logic. Toast on success.

---

## Carried-forward Phase 2 follow-ups (notes from Phase 1, still relevant)

- ~~Server-side scrubbing of recipe ingredients against the allowlist~~ — done in Phase 2 task #2: every emitted ingredient name is matched (case-insensitive, trimmed, strict equality) against `pantry_items.normalized_name` or the locked `ASSUMED_STAPLES` list. Non-matching recipes are dropped before persistence.
- The pantry/recipe/auth Zustand stores have a bidirectional import for sign-out cleanup (lazy `getState()` only). If it ever causes runtime issues, refactor to a centralized `signOut.ts` orchestrator.
- Two narrow type casts in `stores/authStore.ts` (`error as PostgrestError`, `data as Profile`) to clean up when generating Supabase DB types.
- The `profile?.onboarding_complete !== false` check in `app/_layout.tsx` is fail-open — fine while column has `default false`, would need tightening if column ever became nullable.
- Stepper double-tap race in pantry: rapid `+`/`−` taps fire writes from stale snapshots. Acceptable single-user behavior; debounce in Phase 2 if it bothers anyone.
- `npm audit` reports moderate vulnerabilities in transitive dev dependencies. All non-runtime; worth a periodic look.

---

## Current status

**Phase 1 — COMPLETE.**

Shipped:
- Email auth (sign-up, sign-in, sign-out) with email confirmation via Supabase Auth.
- Onboarding thesis screen, gated by `profiles.onboarding_complete`.
- Pantry CRUD with optimistic local-cache + Supabase sync, swipe-to-delete, alphabetical sort, inline rename, quantity stepper.
- AI recipe suggestion ("What can I make?" → Edge Function → Anthropic Claude Haiku 4.5 → 3-5 recipe cards). 10/day server-side rate limit. In-memory only.
- Recipe detail screen with "From your pantry" / "You'll also need" / numbered steps.
- Sign-out clears recipes and pantry from local state.

**Phase 2 — IN PROGRESS.** Scope locked. Build sequence: data model migration → Edge Function rewrite → pantry add/edit redesign → Recipes tab redesign + persistence → cooked-this popup.
