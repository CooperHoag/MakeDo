# CLAUDE.md

**Project:** MakeDo — anti-consumption lifestyle app.

**Read this file at the start of every task.** It's the source of truth for scope, tech stack, standards, and working style. If something in this file conflicts with a user prompt, stop and ask — don't assume.

---

## The app

MakeDo helps users live simply with what they already have. The philosophy is **make do, not consume more.** In Phase 1 the core loop is: pantry inventory → AI suggests recipes the user can cook tonight.

Tone: warm, encouraging, resourceful — never preachy, never judgmental.
UI: clean, minimal, fast.
Target user: 20–35, phone-native, minimalist-curious, budget-conscious.
Platforms: iOS + Android (mobile-first).

---

## Current phase: Phase 1 — Core Loop

### In scope
- Email sign-up / sign-in via Supabase Auth
- Minimal onboarding: one screen explaining the "make do" thesis, then into the app
- Pantry inventory CRUD — **name + quantity only**, no measurements, no categories, no expiration
- AI recipe suggestion: "What can I make?" button → Edge Function → 3–5 recipe cards (name, ingredients used from pantry + ingredients still needed, basic steps)
- Daily AI rate limit: **10 recipe generations per user per day**, enforced server-side
- Cloud-first storage with local cache (Supabase as source of truth; Zustand + AsyncStorage for cache)
- Sign out

### Out of scope — do not build, do not suggest building
- Meal categorization (breakfast / lunch / dinner / snacks / dessert)
- Calorie estimates
- Spicy/flirty narration mode
- Grocery list
- Receipt OCR (Google Vision)
- Expiration dates + reminders
- AI-photo inventory entry
- Workouts, food log, habit tracking, streaks, money-saved, health recovery
- Recipe favoriting, history, sharing
- Push notifications
- Payments / subscriptions

If the user requests any of the above, the **clarifier** agent pauses and confirms: defer to Phase 2+, or expand Phase 1 now (and update this file first).

---

## Tech stack (locked — do not substitute without explicit user approval)

- **Framework:** React Native + Expo (managed workflow)
- **Language:** TypeScript, strict mode, no `any`
- **Navigation:** Expo Router (file-based)
- **Backend:** Supabase (Postgres, Auth, Edge Functions, Storage)
- **State:** Zustand with persist middleware + AsyncStorage
- **AI / LLM:** routed through Supabase Edge Functions only — never from the client
- **Image storage:** Supabase Storage (not used in Phase 1)
- **Testing:** Jest + React Native Testing Library, tests colocated with source
- **Version control:** Git + GitHub

---

## Architecture principles

- **Cloud-first, local-cache.** Supabase is source of truth. Zustand rehydrates from Supabase on launch; AsyncStorage caches for offline display.
- **Optimistic UI.** Local state updates immediately; write to Supabase in the background; visible rollback on failure.
- **Edge Functions for all third-party APIs.** LLMs, OCR, any external service. No third-party SDKs in the mobile bundle except Supabase.
- **Row Level Security (RLS) on every table.** Users can only read/write their own rows. No exceptions.
- **Rate limiting is server-side.** Client-side caps are UX hints only. Enforcement lives in the Edge Function against the `ai_generations` table.

---

## File structure

```
/app                    # Expo Router routes
  /(auth)               # auth route group (sign-in, sign-up)
  /(tabs)               # main tab group (post-auth)
  _layout.tsx
/components             # reusable UI components
/lib                    # utilities, Supabase client, helpers
/stores                 # Zustand stores
/types                  # shared TypeScript types
/supabase
  /migrations           # SQL migration files
  /functions            # Edge Function code
    /suggest-recipes
/.claude
  /agents               # dev.md, reviewer.md, clarifier.md, tester.md
CLAUDE.md               # this file
```

Test files live next to the code they test: `foo.test.ts` next to `foo.ts`.

---

## Data model (Phase 1)

Four concepts, all with RLS enabled:

- `profiles` — 1:1 with `auth.users`. Fields: `id`, `created_at`, `onboarding_complete`.
- `pantry_items` — `id`, `user_id`, `name`, `quantity`, `created_at`, `updated_at`.
- `ai_generations` — `id`, `user_id`, `feature`, `created_at`. Used for rate limiting.
- Recipes themselves are **not persisted** in Phase 1. They're returned from the Edge Function and held in memory.

SQL migrations are checked into `/supabase/migrations` as they're drafted.

---

## Code standards

- **Always use `npx expo install <pkg>` instead of `npm install <pkg>` for any runtime dependency.** Expo's installer picks versions compatible with the project's Expo SDK. `npm install` directly will pull the latest npm version and break native modules. For dev-only dependencies (jest, types, lint plugins), check `npx expo install --check` after installing — if Expo flags a version mismatch, downgrade to the recommended version.
- TypeScript strict. No `any`. No `@ts-ignore` without a comment explaining why.
- Functional components. Hooks only.
- Named exports for components (`export const Foo`). Default exports reserved for Expo Router route files.
- Every async call wrapped in try/catch with a user-visible error state. No silent failures.
- Extract styles to StyleSheet when they exceed ~3 lines inline.
- Every tappable element has an `accessibilityLabel`.
- No `console.log` in merged code. Use a logger util.

---

## Security rules (hard lines)

- **No API key (OpenAI, Anthropic, Google Cloud, Supabase service_role, etc.) goes in the mobile app, its .env, or its bundle.** The client sees only the Supabase anon key.
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
- Every Edge Function: happy path, rate-limit rejection, invalid input, unauthenticated.
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

If the user asks for anything in "Out of scope" above:
1. The clarifier pauses.
2. Asks: "This is a Phase 2+ feature. Expand Phase 1 now, or defer?"
3. If expanding: user updates this file's phase section first, then the dev proceeds.
4. Never silently implement out-of-scope work.

---

## Current status

**Done (foundation only — no features yet):**
- Expo + TypeScript + Expo Router scaffolded into the repo.
- TypeScript strict mode enabled (`strict`, `noImplicitAny`, `noUncheckedIndexedAccess`).
- Folder structure created: `/components`, `/lib`, `/stores`, `/types`, `/supabase/migrations`, `/supabase/functions/suggest-recipes`.
- Dependencies installed: `@supabase/supabase-js`, `zustand`, `@react-native-async-storage/async-storage`. Dev: `jest`, `jest-expo`, `@testing-library/react-native`, `@testing-library/jest-native`, `@types/jest`, `react-test-renderer`.
- Jest configured with `jest-expo` preset; `npm test` exits cleanly with no tests.
- Supabase client at `/lib/supabase.ts` reads `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from env; throws on missing values; uses AsyncStorage for session persistence.
- `.env.example` committed; `.env` gitignored.
- Initial SQL migration at `/supabase/migrations/0001_initial_schema.sql` for `profiles`, `pantry_items`, `ai_generations` with RLS, auto-`updated_at` trigger on `pantry_items`, auto-create-profile trigger on `auth.users`, and `(user_id, created_at)` index on `ai_generations`. **Not yet applied** — user runs in Supabase SQL editor.

**Next:** create Supabase project, copy URL + anon key into local `.env`, run the migration, then build the email auth flow (sign-up / sign-in / sign-out) and onboarding screen.

*Update this section as milestones complete.*