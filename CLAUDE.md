# CLAUDE.md

**Project:** MakeDo — anti-consumption lifestyle app.

**Read this file at the start of every task.** It's the source of truth for scope, tech stack, standards, and working style. If something in this file conflicts with a user prompt, stop and ask — don't assume.

---

## The app

MakeDo helps users live simply with what they already have. The philosophy is **make do, not consume more.** Phase 1 shipped the core loop: pantry inventory → AI suggests recipes the user can cook tonight.

Tone: warm, encouraging, resourceful — never preachy, never judgmental.
UI: clean, minimal, fast.
Target user: 20–35, phone-native, minimalist-curious, budget-conscious.
Platforms: iOS + Android (mobile-first).

---

## Current phase: Phase 2 — scope TBD

Phase 1 is complete. Phase 2 scope will be decided at kickoff, drawing from the candidate list below. **Do not implement Phase 2 features without an updated scope section in this file.**

### Phase 2 candidate features (in rough priority order, subject to user decision at kickoff)

- Recipe persistence & favorites (server-side storage so recipes survive sign-out and sync across devices)
- Pantry decrement after cooking (close the loop: cooking a recipe reduces pantry quantities)
- Spicy/flirty narration mode for recipes
- Grocery list (with pantry → grocery integration when items hit 0)
- Calorie estimates and meal categorization (breakfast / lunch / dinner / snacks / dessert)
- Receipt OCR for auto-populating pantry (Google Cloud Vision via Edge Function)
- Expiration date tracking + reminders for perishables
- AI-photo inventory entry (paid-tier feature)
- Workouts module (goals, plans, injury accommodations, weight/time/distance logging)
- Food log + AI recommendations integration
- Habit tracking (streaks, milestones, money saved, sobriety/health recovery)
- Push notifications
- Payments / subscriptions (paid tier)

### Out of scope for whatever Phase 2 turns out to be

- Anything not in the agreed Phase 2 scope, even if listed above. The clarifier agent must pause if a request crosses scope.
- Anthropic SDK as a dep (continue using `fetch` directly in Edge Functions).
- Anything that would put a third-party API key in the client bundle.

---

## Tech stack (locked — do not substitute without explicit user approval)

- **Framework:** React Native + Expo (managed workflow), SDK 54
- **Language:** TypeScript, strict mode, no `any`
- **Navigation:** Expo Router (file-based)
- **Backend:** Supabase (Postgres, Auth, Edge Functions, Storage)
- **State:** Zustand
- **AI / LLM:** routed through Supabase Edge Functions only — never from the client. Current model: `claude-haiku-4-5-20251001` via Anthropic Messages API.
- **Image storage:** Supabase Storage (not yet used)
- **Testing:** Jest + React Native Testing Library, tests colocated with source
- **Version control:** Git + GitHub

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
  _layout.tsx
/components             # reusable UI components
/lib                    # utilities, Supabase client, helpers
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

## Data model (current)

All tables have RLS enabled, gated to `auth.uid() = user_id` (or `id` for profiles).

- `profiles` — `id`, `created_at`, `onboarding_complete`. 1:1 with `auth.users` via the `handle_new_user` trigger.
- `pantry_items` — `id`, `user_id`, `name`, `quantity`, `created_at`, `updated_at`. `user_id` defaults to `auth.uid()` (migration 0002).
- `ai_generations` — `id`, `user_id`, `feature`, `created_at`. Used for daily rate limiting. `user_id` defaults to `auth.uid()`.

Recipes are NOT persisted (Phase 1 decision); they live in Zustand memory only.

Migrations applied:
- `0001_initial_schema.sql` — three tables + RLS + triggers.
- `0002_user_id_defaults.sql` — `user_id` defaults to `auth.uid()` on `pantry_items` and `ai_generations`.

**Convention for any new user-owned table:**
- `user_id` column with `default auth.uid()`.
- RLS policies for SELECT/INSERT/UPDATE/DELETE gated to `user_id = auth.uid()`.
- Client code passes `user_id` explicitly on insert as belt-and-suspenders.

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

- Every AI feature has a per-user daily cap. Phase 1: **10 recipe generations / user / day**.
- Cap is enforced in the Edge Function: count rows in `ai_generations` for this user for today before calling the LLM. At limit → return 429 with a friendly message.
- Log every successful generation to `ai_generations`.
- If the pantry is large, truncate or summarize before sending to the LLM. Never blindly dump the full list if it risks a runaway token bill.
- **Phase 2 follow-up:** revisit the 10/day rate limit once we have real usage data. Consider making the cap configurable per user tier (free: 10/day; paid: 50+/day or unlimited).

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

## Carried-forward Phase 2 follow-ups (notes from Phase 1)

- Recipe persistence + favorites (recipes currently in-memory only).
- Server-side scrubbing of `ingredients_needed` against the allowlist (currently relies on the LLM following the prompt).
- Unit-aware pantry tracking (would enable pantry decrement after cooking and remove "0.5 olive oil" ambiguity).
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

Test count: 79 tests across 9 suites, all passing. TypeScript strict, no `any`. `npx expo install --check` clean.

**Next:** Phase 2 kickoff. Scope TBD with user.