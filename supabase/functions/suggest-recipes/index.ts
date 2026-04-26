// MakeDo: suggest-recipes Edge Function (Deno).
//
// Reads the caller's pantry (via RLS-scoped Supabase client), enforces a
// per-user daily rate limit on `ai_generations`, calls Anthropic Claude
// Haiku 4.5 for recipe suggestions, logs the generation, and returns a
// validated `{ recipes: Recipe[] }` payload.
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

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM_PROMPT = `You are MakeDo's recipe assistant. The user has a pantry of items. Suggest 3-5 simple, achievable recipes they could make with what they have, allowing for small additions of common pantry staples (oil, salt, pepper, water) that you can list as "needed" if missing.

Respond with valid JSON ONLY — no preamble, no markdown fences, no commentary. Match this exact shape:

{
  "recipes": [
    {
      "name": "string",
      "description": "one sentence",
      "ingredients_used": [{ "name": "string matching a pantry item exactly", "quantity": 1 }],
      "ingredients_needed": ["common staple they may not have"],
      "steps": ["step 1", "step 2", "..."],
      "estimated_minutes": 30
    }
  ]
}

Rules:
- Prefer recipes that use what they HAVE over recipes that need many additions.
- ingredients_used names must match pantry item names exactly (case-sensitive).
- ingredients_used.quantity represents how many UNITS of that pantry item the recipe will consume. It must NEVER exceed the user's available quantity. It SHOULD often be less — most recipes don't consume entire pantry items. A recipe using "half a medium onion" should set quantity to 1 (one onion item touched), not 2.
- ingredients_needed must ONLY include items from this allowlist: oil, olive oil, salt, pepper, black pepper, water. Nothing else.
- If a recipe would require an ingredient not in the pantry and not in the allowlist (e.g. garlic, butter, soy sauce, cinnamon, herbs), DO NOT suggest that recipe. Pick a different recipe that works without it.
- Optional flourishes the user might enjoy if they happen to have them (e.g. "season with cinnamon if you have it") may be mentioned IN STEPS but never in ingredients_needed.
- Embed precise measurements and counts in the steps themselves. EVERY step that uses a pantry ingredient must specify how much: "Slice half a medium onion," "Core and dice 1 apple," "Heat 2 tablespoons olive oil." Never write vague instructions like "slice the onions" or "add the apples" — always specify quantity. Use household measures (tablespoons, cups, pieces, halves) — the user does not have a kitchen scale.
- Recipe portions should be reasonable for 1-2 servings unless context suggests otherwise. Don't write recipes that consume someone's entire week of inventory in one sitting.
- Keep steps concise but complete — 4-8 steps typical.
- Tone: warm, encouraging, never preachy.`;

type RecipeIngredientUsed = {
  name: string;
  quantity: number;
};

type Recipe = {
  name: string;
  description: string;
  ingredients_used: RecipeIngredientUsed[];
  ingredients_needed: string[];
  steps: string[];
  estimated_minutes: number;
};

type PantryRow = { name: string; quantity: number };

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

const validateRecipes = (parsed: unknown): Recipe[] | null => {
  if (!parsed || typeof parsed !== 'object') return null;
  const maybe = (parsed as { recipes?: unknown }).recipes;
  if (!Array.isArray(maybe) || maybe.length === 0) return null;

  const out: Recipe[] = [];
  for (const raw of maybe) {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (!isString(r.name) || !isString(r.description)) return null;
    if (!Array.isArray(r.ingredients_used)) return null;
    if (!Array.isArray(r.ingredients_needed)) return null;
    if (!Array.isArray(r.steps)) return null;
    if (!isNumber(r.estimated_minutes)) return null;

    const used: RecipeIngredientUsed[] = [];
    for (const u of r.ingredients_used) {
      if (!u || typeof u !== 'object') return null;
      const ur = u as Record<string, unknown>;
      if (!isString(ur.name) || !isNumber(ur.quantity)) return null;
      used.push({ name: ur.name, quantity: ur.quantity });
    }

    const needed: string[] = [];
    for (const n of r.ingredients_needed) {
      if (!isString(n)) return null;
      needed.push(n);
    }

    const steps: string[] = [];
    for (const s of r.steps) {
      if (!isString(s)) return null;
      steps.push(s);
    }

    out.push({
      name: r.name,
      description: r.description,
      ingredients_used: used,
      ingredients_needed: needed,
      steps,
      estimated_minutes: r.estimated_minutes,
    });
  }
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

  // Pantry fetch (RLS scoped).
  let pantry: PantryRow[];
  try {
    const { data, error } = await supabase
      .from('pantry_items')
      .select('name, quantity')
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

  if (pantry.length === 0) {
    return json(400, { error: 'Add some items to your pantry first.' });
  }

  const userPrompt = `Here is the user's pantry. Suggest recipes:

${JSON.stringify({ pantry })}`;

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

  const recipes = validateRecipes(parsed);
  if (!recipes) {
    console.error('LLM output failed validation', parsed);
    return json(502, {
      error: 'Could not understand the recipe response. Please try again.',
    });
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

  return json(200, { recipes });
});
