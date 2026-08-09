// MakeDo: suggest-recipes Edge Function (Deno).
//
// Phase 2 rewrite. Reads the caller's pantry (via RLS-scoped Supabase
// client), enforces a per-user daily rate limit on `ai_generations`, calls
// Anthropic Claude Haiku 4.5 for category-targeted recipe suggestions,
// validates and scrubs the response, persists exactly 4 recipes to the
// `recipes` table, logs the generation, and returns the inserted rows.
//
// Secrets required (set via `supabase secrets set`):
//   ANTHROPIC_API_KEY       (server-only, never bundled with the client)
// Built-in (provided by the Supabase Edge runtime):
//   SUPABASE_URL
//   SUPABASE_ANON_KEY

// @ts-expect-error: Deno-style remote import; only resolves in the Edge runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

// Minimal Deno ambient declarations so this file can be sanity-checked by
// other tooling without pulling in a full Deno types dep.
declare const Deno: {
  env: { get: (name: string) => string | undefined };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const DAILY_LIMIT = 10;
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const RECIPES_PER_GENERATION = 4;
const INSERT_RETRY_DELAY_MS = 250;
const MIN_PANTRY_ITEMS = 5;

const RECIPE_CATEGORIES = [
  'breakfast',
  'lunch',
  'dinner',
  'dessert',
  'snack',
] as const;
type RecipeCategory = (typeof RECIPE_CATEGORIES)[number];

const PANTRY_UNITS = [
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
  'L',
] as const;
type PantryUnit = (typeof PANTRY_UNITS)[number];

// Locked Phase 2 staples list. Names are matched case-insensitively, trimmed,
// against ingredient names emitted by the LLM. Keep in sync with CLAUDE.md
// §AI / cost management.
const ASSUMED_STAPLES = [
  'Salt',
  'Black pepper',
  'Water',
  'Neutral cooking oil',
  'Garlic powder',
  'Onion powder',
  'Paprika',
  'Chili flakes',
  'Dried oregano',
  'Dried basil',
  'Dried thyme',
  'Bay leaves',
] as const;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM_PROMPT = `You are MakeDo's recipe assistant. MakeDo is an anti-consumption app — the user wants recipes built ONLY from what they already have. Do not suggest ingredients beyond their pantry plus the assumed-staples list below.

The user has a pantry of items, each with a name, quantity, and unit. The user has also selected a meal category they want recipes for.

Suggest EXACTLY 4 recipes. Every recipe must:
- Match the requested meal category.
- Use ONLY ingredients from the user's pantry plus the assumed staples list. Never reference any other ingredient.
- Try to use ingredient quantities that match the user's pantry units. For example, if the pantry says "rice — 2 lb", prefer "8 oz rice" over "1 cup rice". When you cannot match the pantry unit (e.g., "1 clove garlic" when the pantry has garlic in lb), use a natural recipe unit and emit unit as null.

When referencing pantry items, use the exact name as it appears in the user's pantry list below. Do not paraphrase, shorten, or substitute. Use the assumed-staples names verbatim from the staples list above.

Assumed staples (every kitchen has these — use freely without listing in pantry):
Salt, Black pepper, Water, Neutral cooking oil, Garlic powder, Onion powder, Paprika, Chili flakes, Dried oregano, Dried basil, Dried thyme, Bay leaves

Respond with valid JSON ONLY — no preamble, no markdown fences, no commentary. Match this exact shape:

{
  "recipes": [
    {
      "name": "string",
      "description": "one sentence",
      "category": "must match the requested category exactly",
      "ingredients": [
        { "name": "string matching a pantry item or an assumed staple exactly", "quantity": 1, "unit": "lb" | "oz" | "g" | "kg" | "fl_oz" | "cup" | "tbsp" | "tsp" | "ml" | "L" | "count" | null }
      ],
      "steps": ["step 1", "step 2", "..."],
      "estimated_minutes": 30
    }
  ]
}

Rules:
- Exactly 4 recipes per response. Not 3, not 5.
- Every ingredient name must match either a pantry item name (case-insensitive) or an assumed staple. No exceptions.
- Quantities are numbers. Unit is one of the allowed values or null.
- Keep steps concise but complete — 4-8 steps typical.
- Tone: warm, encouraging, never preachy.
- Match the requested meal category. If the user asks for breakfast, every recipe is breakfast.`;

type RecipeIngredient = {
  name: string;
  quantity: number;
  unit: PantryUnit | null;
};

type ValidatedRecipe = {
  name: string;
  description: string | null;
  category: RecipeCategory;
  ingredients: RecipeIngredient[];
  steps: string[];
  estimated_minutes: number | null;
};

type PantryRow = {
  name: string;
  normalized_name: string;
  quantity: number;
  unit: string;
};

type AnthropicContentBlock = { type?: string; text?: unknown };
type AnthropicResponse = { content?: AnthropicContentBlock[] };

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });

const startOfTodayUtcIso = (): string => {
  const now = new Date();
  const startUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  );
  return startUtc.toISOString();
};

const stripFences = (text: string): string =>
  text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

const isString = (v: unknown): v is string => typeof v === 'string';
const isNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

const isRecipeCategory = (v: unknown): v is RecipeCategory =>
  isString(v) && (RECIPE_CATEGORIES as readonly string[]).includes(v);

const isPantryUnit = (v: unknown): v is PantryUnit =>
  isString(v) && (PANTRY_UNITS as readonly string[]).includes(v);

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Strict, case-insensitive, trimmed equality for ingredient name matching.
// `pantryNormalized` is the set of pantry rows' `normalized_name` values.
// `staplesNormalized` is ASSUMED_STAPLES lowercased+trimmed.
const ingredientMatches = (
  rawName: string,
  pantryNormalized: Set<string>,
  staplesNormalized: Set<string>,
): boolean => {
  const candidate = rawName.trim().toLowerCase();
  if (candidate.length === 0) return false;
  return pantryNormalized.has(candidate) || staplesNormalized.has(candidate);
};

// Validate a single LLM-emitted recipe against the requested category and
// the matchable-ingredient sets. Returns the validated recipe, or null if it
// should be dropped.
const validateRecipe = (
  raw: unknown,
  requestedCategory: RecipeCategory,
  pantryNormalized: Set<string>,
  staplesNormalized: Set<string>,
): ValidatedRecipe | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  if (!isString(r.name) || r.name.trim().length === 0) return null;
  if (!isRecipeCategory(r.category)) return null;
  if (r.category !== requestedCategory) return null;
  if (!Array.isArray(r.ingredients)) return null;
  if (!Array.isArray(r.steps)) return null;

  // description and estimated_minutes are nullable in the persisted shape.
  const description = isString(r.description) ? r.description : null;
  const estimatedMinutes = isNumber(r.estimated_minutes)
    ? r.estimated_minutes
    : null;

  const steps: string[] = [];
  for (const s of r.steps) {
    if (!isString(s)) return null;
    steps.push(s);
  }

  const ingredients: RecipeIngredient[] = [];
  for (const item of r.ingredients) {
    if (!item || typeof item !== 'object') return null;
    const ing = item as Record<string, unknown>;
    if (!isString(ing.name) || ing.name.trim().length === 0) return null;
    if (!isNumber(ing.quantity)) return null;

    // Server-side scrubbing — drop the whole recipe if any ingredient name
    // doesn't strictly match a pantry item or assumed staple.
    if (!ingredientMatches(ing.name, pantryNormalized, staplesNormalized)) {
      return null;
    }

    // Coerce invalid units to null instead of dropping the recipe.
    const unit: PantryUnit | null =
      ing.unit === null || ing.unit === undefined
        ? null
        : isPantryUnit(ing.unit)
          ? ing.unit
          : null;

    ingredients.push({
      name: ing.name,
      quantity: ing.quantity,
      unit,
    });
  }

  return {
    name: r.name,
    description,
    category: r.category,
    ingredients,
    steps,
    estimated_minutes: estimatedMinutes,
  };
};

const validateRecipes = (
  parsed: unknown,
  requestedCategory: RecipeCategory,
  pantryNormalized: Set<string>,
  staplesNormalized: Set<string>,
): ValidatedRecipe[] | null => {
  if (!parsed || typeof parsed !== 'object') return null;
  const maybe = (parsed as { recipes?: unknown }).recipes;
  if (!Array.isArray(maybe)) return null;
  if (maybe.length !== RECIPES_PER_GENERATION) return null;

  const out: ValidatedRecipe[] = [];
  for (const raw of maybe) {
    const validated = validateRecipe(
      raw,
      requestedCategory,
      pantryNormalized,
      staplesNormalized,
    );
    if (validated) out.push(validated);
  }
  if (out.length < RECIPES_PER_GENERATION) return null;
  return out;
};

Deno.serve(async (req: Request): Promise<Response> => {
  // Preflight.
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  // Parse body for category.
  let requestedCategory: RecipeCategory;
  try {
    const body = (await req.json()) as { category?: unknown };
    if (!isRecipeCategory(body?.category)) {
      return json(400, { error: 'Invalid or missing category.' });
    }
    requestedCategory = body.category;
  } catch {
    return json(400, { error: 'Invalid or missing category.' });
  }

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) {
    console.error('ANTHROPIC_API_KEY missing from Edge Function secrets');
    return json(500, { error: 'Server is not configured. Try again later.' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('SUPABASE_URL or SUPABASE_ANON_KEY missing');
    return json(500, { error: 'Server is not configured. Try again later.' });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json(401, { error: 'Unauthorized' });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Verify user.
  let userId: string;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) {
      return json(401, { error: 'Unauthorized' });
    }
    userId = data.user.id;
  } catch (err) {
    console.error('auth.getUser threw', err);
    return json(401, { error: 'Unauthorized' });
  }

  // Rate limit (server-side, authoritative).
  try {
    const { count, error } = await supabase
      .from('ai_generations')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', startOfTodayUtcIso());
    if (error) {
      console.error('rate-limit count failed', error);
      return json(500, { error: 'Could not check your daily limit. Try again.' });
    }
    if ((count ?? 0) >= DAILY_LIMIT) {
      return json(429, {
        error: "You've used your 10 daily recipe suggestions. Try again tomorrow.",
      });
    }
  } catch (err) {
    console.error('rate-limit count threw', err);
    return json(500, { error: 'Could not check your daily limit. Try again.' });
  }

  // Pantry fetch (RLS scoped). Phase 2: include unit + normalized_name so the
  // LLM can match units and the server-side scrubber can verify names.
  let pantry: PantryRow[];
  try {
    const { data, error } = await supabase
      .from('pantry_items')
      .select('name, normalized_name, quantity, unit')
      .gt('quantity', 0);
    if (error) {
      console.error('pantry fetch failed', error);
      return json(500, { error: 'Could not load your pantry. Try again.' });
    }
    pantry = (data ?? []) as PantryRow[];
  } catch (err) {
    console.error('pantry fetch threw', err);
    return json(500, { error: 'Could not load your pantry. Try again.' });
  }

  if (pantry.length < MIN_PANTRY_ITEMS) {
    return json(400, { error: 'Add a few more items to get recipe ideas.' });
  }

  // Build the matchable-name sets for the scrubber.
  const pantryNormalized = new Set(
    pantry.map((row) => row.normalized_name.trim().toLowerCase()),
  );
  const staplesNormalized = new Set(
    ASSUMED_STAPLES.map((name) => name.trim().toLowerCase()),
  );

  const userPrompt = `Requested category: ${requestedCategory}

The user's pantry:
${JSON.stringify(pantry)}

Suggest 4 recipes for the ${requestedCategory} category, using only the pantry plus assumed staples.`;

  // Anthropic call. Never leak provider error details client-side.
  let anthropicBody: AnthropicResponse;
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '<no body>');
      console.error('anthropic non-ok', res.status, detail);
      return json(502, { error: 'Recipe service is unavailable. Please try again.' });
    }
    anthropicBody = (await res.json()) as AnthropicResponse;
  } catch (err) {
    console.error('anthropic fetch threw', err);
    return json(502, { error: 'Recipe service is unavailable. Please try again.' });
  }

  const firstBlock = anthropicBody.content?.[0];
  const rawText = firstBlock && isString(firstBlock.text) ? firstBlock.text : null;
  if (!rawText) {
    console.error('anthropic returned no text content', anthropicBody);
    return json(502, {
      error: 'Could not understand the recipe response. Please try again.',
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(rawText));
  } catch (err) {
    console.error('JSON.parse of LLM output failed', err, rawText);
    return json(502, {
      error: 'Could not understand the recipe response. Please try again.',
    });
  }

  const recipes = validateRecipes(
    parsed,
    requestedCategory,
    pantryNormalized,
    staplesNormalized,
  );
  if (!recipes) {
    console.error('LLM output failed validation', parsed);
    return json(502, {
      error: 'Could not understand the recipe response. Please try again.',
    });
  }

  // Persist recipes — single batch insert, retry once on failure with brief
  // delay. Rely on column defaults for `id`, `user_id`, `created_at`,
  // `expires_at`, `is_favorite`. RLS ensures rows belong to the caller.
  const insertRows = recipes.map((r) => ({
    name: r.name,
    description: r.description,
    category: r.category,
    ingredients: r.ingredients,
    steps: r.steps,
    estimated_minutes: r.estimated_minutes,
  }));

  const tryInsert = async (): Promise<{ data: unknown; error: unknown }> => {
    try {
      const result = await supabase.from('recipes').insert(insertRows).select('*');
      return { data: result.data, error: result.error };
    } catch (err) {
      return { data: null, error: err };
    }
  };

  let inserted: unknown;
  const first = await tryInsert();
  if (first.error || !Array.isArray(first.data)) {
    console.error('recipes insert attempt 1 failed', first.error);
    await sleep(INSERT_RETRY_DELAY_MS);
    const second = await tryInsert();
    if (second.error || !Array.isArray(second.data)) {
      console.error('recipes insert attempt 2 failed', second.error);
      // Do NOT log to ai_generations — refund the user's credit.
      return json(500, {
        error: 'Saved recipes failed to persist. Please try again.',
      });
    }
    inserted = second.data;
  } else {
    inserted = first.data;
  }

  // Log the generation. Don't fail the request on log error.
  try {
    const { error } = await supabase
      .from('ai_generations')
      .insert({ user_id: userId, feature: 'suggest-recipes' });
    if (error) {
      console.error('ai_generations insert failed', error, 'user', userId);
    }
  } catch (err) {
    console.error('ai_generations insert threw', err, 'user', userId);
  }

  return json(200, { recipes: inserted });
});
